#!/usr/bin/env node
'use strict';

/**
 * Pulls generic drug name data from RxNorm (US National Library of
 * Medicine — free, public, no API key required) and merges it into
 * data/brand-to-generic.json as additional "already generic" entries,
 * so the resolver recognizes generic names beyond what's hand-curated.
 *
 * IF YOU'RE SEEING "EAI_AGAIN" OR BLANK ERRORS:
 * That usually means DNS resolution for rxnav.nlm.nih.gov is failing on
 * your network, often because of a flaky/partial IPv6 route (curl falls
 * back to IPv4 automatically; Node doesn't always, which is why this
 * script forces IPv4 below via dns.setDefaultResultOrder). If it's still
 * failing after that, things to try, in order:
 *   1. Try from a different network (mobile hotspot) to confirm it's
 *      network-specific, not a global outage.
 *   2. If you're on a VPN or corporate/campus network, try without it.
 *   3. Try a public DNS resolver: on macOS, System Settings -> Wi-Fi ->
 *      Details -> DNS -> add 8.8.8.8 and 1.1.1.1, or run:
 *        dig @8.8.8.8 rxnav.nlm.nih.gov
 *      to see if a different resolver succeeds where your default one fails.
 *   4. As a fallback that doesn't need the live API at all, RxNorm also
 *      ships full offline data files (RXNCONSO.RRF) you can download once
 *      and grep locally — see scripts/README.md.
 *
 * Usage:
 *   node scripts/fetch-rxnorm-generics.js path/to/drug-list.txt
 *
 * What this script does per name:
 *   1. GET https://rxnav.nlm.nih.gov/REST/rxcui.json?name=<name>
 *   2. If found, GET the related "IN" (ingredient / generic) concept
 *   3. Append a de-duplicated entry to a merged JSON you review before
 *      committing over the real dataset file.
 *
 * This never overwrites data/brand-to-generic.json directly — it writes
 * to data/brand-to-generic.rxnorm-import.json so you can diff and review
 * before merging, since this data will ship as a health-safety tool.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const dns = require('dns');

// Prefer IPv4 when resolving hostnames. Some networks have broken/partial
// IPv6 routing, which causes Node's https.get to hang or throw an
// AggregateError (with an empty top-level .message) even though plain
// curl succeeds, because curl falls back to IPv4 faster than Node does
// by default. This fixes that class of failure.
if (dns.setDefaultResultOrder) dns.setDefaultResultOrder('ipv4first');

const RXNORM_BASE = 'https://rxnav.nlm.nih.gov/REST';

function httpGetJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { Accept: 'application/json' }, family: 4 }, (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          if (res.statusCode !== 200) {
            return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          }
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on('error', reject);
  });
}

async function lookupRxcui(name) {
  const url = `${RXNORM_BASE}/rxcui.json?name=${encodeURIComponent(name)}`;
  const json = await httpGetJson(url);
  const ids = json?.idGroup?.rxnormId || [];
  return ids[0] || null;
}

async function lookupIngredients(rxcui) {
  const url = `${RXNORM_BASE}/rxcui/${rxcui}/related.json?tty=IN`;
  const json = await httpGetJson(url);
  const groups = json?.relatedGroup?.conceptGroup || [];
  const names = [];
  for (const g of groups) {
    for (const c of g.conceptProperties || []) {
      names.push(c.name);
    }
  }
  return names;
}

/** Unwraps Node's AggregateError (common for DNS failures that try
 * multiple addresses) into a readable string, since its own .message
 * is often empty even though the real detail is in err.errors[]. */
function describeError(err) {
  if (err && Array.isArray(err.errors) && err.errors.length) {
    return err.errors.map((e) => [e.name, e.code, e.message].filter(Boolean).join(' ')).join(' | ');
  }
  const direct = [err?.name, err?.code, err?.message].filter(Boolean).join(' ');
  return direct || '(no error detail available — raw object logged below)';
}

async function main() {
  const listPath = process.argv[2];
  if (!listPath) {
    console.error('Usage: node scripts/fetch-rxnorm-generics.js path/to/drug-list.txt');
    process.exit(1);
  }

  const names = fs
    .readFileSync(listPath, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const results = [];
  let failureCount = 0;
  for (const name of names) {
    try {
      const rxcui = await lookupRxcui(name);
      if (!rxcui) {
        console.warn(`[skip] no RxNorm match for "${name}"`);
        continue;
      }
      const ingredients = await lookupIngredients(rxcui);
      if (ingredients.length === 0) {
        console.warn(`[skip] "${name}" matched rxcui ${rxcui} but no ingredient names found`);
        continue;
      }
      console.log(`[ok] ${name} -> ${ingredients.join(', ')}`);
      results.push({ brand: name, genericNames: ingredients, combination: ingredients.length > 1, source: 'rxnorm' });
      await new Promise((r) => setTimeout(r, 200));
    } catch (err) {
      failureCount++;
      const detail = describeError(err);
      console.warn(`[error] "${name}": ${detail}`);
      if (detail.startsWith('(no error detail')) console.warn(err);
    }
  }

  if (failureCount > 0 && failureCount === names.length) {
    console.warn(
      '\nEvery single lookup failed the same way — this is almost certainly a network/DNS issue reaching ' +
        'rxnav.nlm.nih.gov from this machine/network, not a problem with individual drug names. See the ' +
        'troubleshooting notes at the top of this script.'
    );
  }

  const outPath = path.join(__dirname, '..', 'data', 'brand-to-generic.rxnorm-import.json');
  fs.writeFileSync(outPath, JSON.stringify({ entries: results }, null, 2));
  console.log(`\nWrote ${results.length} entries to ${outPath}`);
  console.log('Review this file, then manually merge the entries you trust into data/brand-to-generic.json.');
}

main();
