'use strict';

const brandData = require('../data/brand-to-generic.json');
const interactionData = require('../data/interactions.json');

/**
 * rxcheck-india
 * ---------------
 * A small, open starter toolkit for:
 *   1. Resolving Indian pharmaceutical brand names to generic (INN) names.
 *   2. Checking a list of drugs for known drug-drug interactions.
 *
 * IMPORTANT SAFETY NOTE: the bundled datasets (data/brand-to-generic.json,
 * data/interactions.json) are small, manually curated SEED datasets meant to
 * bootstrap this project. They are NOT exhaustive and NOT a certified medical
 * device or clinical decision support system. Do not rely on this package as
 * the sole basis for a clinical decision. See README.md.
 */

// ---- Build lookup structures once at module load (O(n) build, O(1) lookup) ----

const _normalize = (s) => String(s || '').trim().toLowerCase();

// brand name (lowercased) -> entry
const brandIndex = new Map();
for (const entry of brandData.entries) {
  brandIndex.set(_normalize(entry.brand), entry);
}

// sorted "generic1|generic2" (lowercased) -> interaction record
const interactionIndex = new Map();
const pairKey = (a, b) => {
  const pair = [_normalize(a), _normalize(b)].sort();
  return pair[0] + '|' + pair[1];
};
for (const rec of interactionData.pairs) {
  interactionIndex.set(pairKey(rec.a, rec.b), rec);
}

/**
 * Look up a brand name and return its mapping entry, or null if unknown.
 * Lookup is case-insensitive and trims whitespace.
 * @param {string} name
 * @returns {{brand: string, genericNames: string[], combination: boolean, notes?: string} | null}
 */
function lookupBrand(name) {
  return brandIndex.get(_normalize(name)) || null;
}

/**
 * Resolve a single drug name (brand OR generic) to its list of generic names.
 * If the name isn't found in the brand map, it is assumed to already be a
 * generic name and is returned as-is (so the package degrades gracefully
 * for generics it doesn't know about by brand, as long as the caller already
 * used the generic name).
 * @param {string} name
 * @returns {{input: string, genericNames: string[], resolvedFrom: 'brand'|'assumed-generic'}}
 */
function resolveToGeneric(name) {
  const entry = lookupBrand(name);
  if (entry) {
    return { input: name, genericNames: entry.genericNames, resolvedFrom: 'brand' };
  }
  return { input: name, genericNames: [String(name).trim()], resolvedFrom: 'assumed-generic' };
}

/**
 * Check a list of drug names (brand or generic, mixed is fine) for known
 * pairwise drug-drug interactions.
 *
 * @param {string[]} drugNames - e.g. ["Ecosprin", "Warfarin", "Combiflam"]
 * @returns {{
 *   resolved: Array<{input: string, genericNames: string[], resolvedFrom: string}>,
 *   interactions: Array<{drugA: string, drugB: string, genericA: string, genericB: string, severity: string, mechanism: string, recommendation: string}>,
 *   unknownBrands: string[]
 * }}
 */
function checkInteractions(drugNames) {
  if (!Array.isArray(drugNames)) {
    throw new TypeError('checkInteractions expects an array of drug name strings');
  }

  const resolved = drugNames.map(resolveToGeneric);
  const unknownBrands = resolved
    .filter((r) => r.resolvedFrom === 'assumed-generic' && !isKnownGeneric(r.genericNames[0]))
    .map((r) => r.input);

  // Flatten to a list of { sourceInput, generic } pairs so combination
  // products (multiple actives per brand) are each checked individually.
  const flat = [];
  for (const r of resolved) {
    for (const g of r.genericNames) {
      flat.push({ sourceInput: r.input, generic: g });
    }
  }

  const interactions = [];
  const seenPairs = new Set();

  for (let i = 0; i < flat.length; i++) {
    for (let j = i + 1; j < flat.length; j++) {
      const { sourceInput: inputA, generic: genericA } = flat[i];
      const { sourceInput: inputB, generic: genericB } = flat[j];

      if (_normalize(genericA) === _normalize(genericB) && inputA === inputB) continue; // same source entry duplicate

      const key = pairKey(genericA, genericB);
      if (seenPairs.has(key)) continue; // avoid duplicate reporting when two combo brands share an active

      const rec = interactionIndex.get(key);
      if (rec) {
        seenPairs.add(key);
        interactions.push({
          drugA: inputA,
          drugB: inputB,
          genericA,
          genericB,
          severity: rec.severity,
          mechanism: rec.mechanism,
          recommendation: rec.recommendation,
        });
      }
    }
  }

  // Sort most severe first for a saner default display order
  const severityRank = { major: 0, moderate: 1, minor: 2 };
  interactions.sort((a, b) => (severityRank[a.severity] ?? 9) - (severityRank[b.severity] ?? 9));

  return { resolved, interactions, unknownBrands };
}

// Build a flat set of every generic name that appears anywhere in the
// interaction dataset or as a brand's generic, so we can tell "assumed
// generic because unrecognized brand" apart from "recognized generic name".
const knownGenerics = new Set();
for (const entry of brandData.entries) {
  for (const g of entry.genericNames) knownGenerics.add(_normalize(g));
}
for (const rec of interactionData.pairs) {
  knownGenerics.add(_normalize(rec.a));
  knownGenerics.add(_normalize(rec.b));
}

function isKnownGeneric(name) {
  return knownGenerics.has(_normalize(name));
}

/**
 * Add or override a brand-to-generic mapping at runtime (e.g. to extend the
 * seed dataset with your own entries without forking the package).
 * @param {{brand: string, genericNames: string[], combination?: boolean, notes?: string}} entry
 */
function addBrandMapping(entry) {
  if (!entry || !entry.brand || !Array.isArray(entry.genericNames)) {
    throw new TypeError('addBrandMapping requires { brand: string, genericNames: string[] }');
  }
  brandIndex.set(_normalize(entry.brand), entry);
  for (const g of entry.genericNames) knownGenerics.add(_normalize(g));
}

/**
 * Add or override an interaction record at runtime.
 * @param {{a: string, b: string, severity: 'major'|'moderate'|'minor', mechanism: string, recommendation: string}} rec
 */
function addInteraction(rec) {
  if (!rec || !rec.a || !rec.b || !rec.severity) {
    throw new TypeError('addInteraction requires { a, b, severity, mechanism, recommendation }');
  }
  interactionIndex.set(pairKey(rec.a, rec.b), rec);
  knownGenerics.add(_normalize(rec.a));
  knownGenerics.add(_normalize(rec.b));
}

module.exports = {
  lookupBrand,
  resolveToGeneric,
  checkInteractions,
  addBrandMapping,
  addInteraction,
  isKnownGeneric,
  // exposed for inspection/testing/tooling, not part of the stable API yet
  _internal: { brandIndex, interactionIndex },
};
