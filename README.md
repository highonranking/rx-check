# rxcheck-india

An open starter toolkit for Node/JS developers building anything in or around
Indian healthcare — EMRs, pharmacy systems, telemedicine apps, WhatsApp-bot
clinics — who need two very common building blocks:

1. **Brand → generic resolution.** Indian prescriptions are written with
   brand names (`Ecosprin`, `Combiflam`, `Augmentin`...), but safety logic
   needs to reason about the actual active ingredient(s).
2. **Drug-drug interaction checking.** Given a list of drugs a patient is on,
   flag known interactions by severity, with a short mechanism and
   recommendation.

```js
const { checkInteractions } = require('rxcheck-india');

const result = checkInteractions(['Ecosprin', 'Warf']);
console.log(result.interactions);
// [{
//   drugA: 'Ecosprin', drugB: 'Warf',
//   genericA: 'Aspirin', genericB: 'Warfarin',
//   severity: 'major',
//   mechanism: 'Additive effect on bleeding risk (anticoagulant + antiplatelet)',
//   recommendation: 'Avoid combination unless specifically indicated; monitor INR and for bleeding'
// }]
```

## ⚠️ Read this before you use it for anything real

This package ships with two small, **manually curated seed datasets**:

- `data/brand-to-generic.json` — roughly 100 well-known Indian brand names (last expanded 2026-10, batch 2)
  mapped to generic/INN ingredients.
- `data/interactions.json` — roughly 25 widely-documented, textbook-level
  drug-drug interactions.

Both are explicitly **starter datasets, not clinical-grade references**.
They exist to prove the shape of the API and give you something to build
against immediately. They are:

- **Not exhaustive.** Thousands of brands and interactions exist that this
  package doesn't know about yet. An interaction not being flagged does
  **not** mean it's safe — it may just mean it isn't in the dataset.
- **Not independently verified by a pharmacist** as part of this project
  (yet). Severity labels and mechanisms are simplified summaries of
  well-established pharmacology, not a substitute for a licensed drug
  compendium (e.g. DDInter, Micromedex, Lexicomp, First Databank) or clinical
  judgment.
- **Not a medical device.** Do not present this package's output to a
  patient or clinician as a certified safety check, and do not use it as the
  sole basis for a prescribing decision.

If you're building something that will actually touch patient care, use
this as scaffolding and plug in a verified dataset (or get the bundled one
clinically reviewed) before going live. Contributions that improve accuracy
or expand coverage — ideally from people with a pharmacology/clinical
background — are very welcome; see **Contributing** below.

## Try it with curl

The library itself is just JS functions, but a tiny HTTP server
(`server.js`) is included so you can poke at it without writing any code.
It now requires an API key and enforces rate limiting (see **Security**
below):

```bash
npm install
RXCHECK_API_KEYS="dev-key-123" node server.js
# -> rxcheck-india server listening on http://localhost:3000
```

Then, in another terminal:

```bash
# Resolve a brand name to its generic ingredient(s)
curl -H "x-api-key: dev-key-123" "http://localhost:3000/resolve?drug=Ecosprin"

# Raw brand lookup (404s if the brand isn't in the seed dataset)
curl -H "x-api-key: dev-key-123" "http://localhost:3000/lookup?brand=Combiflam"

# Check a list of drugs for known interactions
curl -X POST http://localhost:3000/check-interactions \
  -H "x-api-key: dev-key-123" -H "Content-Type: application/json" \
  -d '{"drugs": ["Ecosprin", "Warf"]}'

# A combination brand expands into its actives automatically
curl -X POST http://localhost:3000/check-interactions \
  -H "x-api-key: dev-key-123" -H "Content-Type: application/json" \
  -d '{"drugs": ["Ecosprin AV", "Clarithromycin"]}'

# Unknown drug -> flagged, not silently ignored
curl -X POST http://localhost:3000/check-interactions \
  -H "x-api-key: dev-key-123" -H "Content-Type: application/json" \
  -d '{"drugs": ["Crocin", "SomeUnknownDrug"]}'

# No key / wrong key -> 401
curl -i "http://localhost:3000/resolve?drug=Ecosprin"
```

## Security (API key auth + rate limiting)

- **Auth**: set `RXCHECK_API_KEYS` to a comma-separated list of valid keys.
  Requests authenticate via `Authorization: Bearer <key>` or `x-api-key:
  <key>`. With no keys configured, the server fails closed (401 on every
  request) unless you explicitly set `RXCHECK_ALLOW_NO_AUTH=true` for local
  development.
- **Rate limiting**: `RXCHECK_RATE_LIMIT` (default 60) requests per
  `RXCHECK_RATE_WINDOW_MS` (default 60000ms), tracked per API key, in
  memory. Exceeding it returns `429` with a `Retry-After` header.
- This is deliberately simple (see comments in `middleware/auth.js` and
  `middleware/rateLimit.js`) — enough to stop anonymous abuse of an
  early-access deployment, not a full production auth system. Before a
  real production rollout you'd want: issued keys stored hashed in a
  database (not a static env var), per-key scopes/quotas, a Redis-backed
  limiter if you run more than one server instance, HTTPS termination
  (this server speaks plain HTTP — put it behind a reverse proxy/platform
  that handles TLS), and request logging/audit trail.

## Install

```bash
npm install rxcheck-india
```

(Not yet published to npm — see **Status** below.)

## API

### `checkInteractions(drugNames: string[])`

Takes a mixed list of brand and/or generic drug names and returns:

```ts
{
  resolved: Array<{ input: string, genericNames: string[], resolvedFrom: 'brand' | 'assumed-generic' }>,
  interactions: Array<{
    drugA: string, drugB: string,          // the original inputs you passed in
    genericA: string, genericB: string,    // what they were resolved to
    severity: 'major' | 'moderate' | 'minor',
    mechanism: string,
    recommendation: string,
  }>,
  unknownBrands: string[], // inputs that weren't a known brand and aren't a generic name in our dataset either
}
```

Combination brands (e.g. `Combiflam` = Ibuprofen + Paracetamol) are expanded
automatically, so each active ingredient is checked individually against
everything else in the list. Interactions are sorted major → moderate → minor.

### `resolveToGeneric(name: string)`

Resolves one brand or generic name to `{ input, genericNames, resolvedFrom }`.
If the name isn't a recognized brand, it's assumed to already be a generic
name (so passing real generic names always works, even for generics not yet
cross-referenced from a brand).

### `lookupBrand(name: string)`

Case-insensitive brand lookup. Returns the raw dataset entry or `null`.

### `addBrandMapping(entry)` / `addInteraction(record)`

Extend the dataset at runtime without forking the package — useful for
adding your organization's formulary-specific brands, or interactions you've
verified yourself:

```js
const { addBrandMapping, addInteraction } = require('rxcheck-india');

addBrandMapping({ brand: 'Dolonex', genericNames: ['Piroxicam'] });
addInteraction({
  a: 'Piroxicam', b: 'Warfarin',
  severity: 'major',
  mechanism: 'NSAID increases bleeding risk with anticoagulants',
  recommendation: 'Avoid combination; monitor INR if unavoidable',
});
```

## Design notes

- Lookups are O(1) via hash maps built once at module load (brand index,
  and a sorted-pair index for interactions) rather than scanning arrays on
  every call — this matters once the dataset grows into the thousands.
- The interaction key is a sorted pair (`[a, b].sort().join('|')`), so order
  of input doesn't matter and each unordered pair is stored once.
- Combination products are expanded into their individual actives before
  pairwise checking, so a 2-ingredient brand checked against a 2-ingredient
  brand correctly produces up to 4 pairwise checks, not 1.

## Coverage: what "covers all meds in India and outside" actually requires

Short version: it isn't done yet, and it can't responsibly be done by
hand-typing more JSON entries from memory — this is health-safety data,
and a confidently-wrong entry is worse than a missing one. Honest status:

- **India brand coverage**: ~100 common brands, hand-curated (last
  expanded 2026-10). There's no free, bulk, authoritative Indian
  brand-name database equivalent to RxNorm — see `scripts/README.md` for
  the realistic paths (crowd-sourcing, CDSCO public registers, or
  licensing a commercial compendium like CIMS/MIMS for a paid tier, since
  their data generally can't be redistributed in an open package). Tested
  directly: RxNorm itself does not cover Indian brand names (see
  `scripts/README.md` for the test results), so that's a dead end for
  this specific half of the problem.
- **Global generic coverage**: ~25 interaction pairs, hand-curated from
  well-established pharmacology. `scripts/fetch-rxnorm-generics.js` can
  pull broader, international, citable generic-name data from RxNorm
  (free, US NLM) — run it from a machine with normal internet access.
- **Interaction breadth**: DDInter (academic, open) is a promising source
  for a bulk interaction import but its current API/download shape hasn't
  been verified yet — check its terms and structure before scripting
  against it.

## Status / roadmap

Early-access (v0.1 → v0.2). Not yet published to npm.

1. ~~Basic auth + rate limiting on the reference server~~ — done.
2. Get the seed interaction dataset reviewed by a pharmacist/clinician.
3. Run the RxNorm import script against a real network connection and
   merge reviewed results into `data/brand-to-generic.json`.
4. Investigate DDInter for bulk interaction import (terms + data shape
   TBD — see `scripts/README.md`).
5. Expand India-specific brand coverage via community contributions.
6. Add dosage-range sanity checks (not just drug-drug pairs).
7. Publish v1.0 to npm once coverage and clinical review above are in place.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full guide — especially its
data-quality bar, since this is health-safety-adjacent data. Short version:
pharmacists, clinicians, and anyone who can cite an authoritative source are
very welcome to add or correct brand mappings and interaction records via
the issue templates under `.github/ISSUE_TEMPLATE/` or a PR; code
contributions (library, server, import scripts) are welcome too, with tests.

## License

MIT — see `LICENSE`. The bundled datasets are original curation work by the
project; no proprietary drug compendium data is included.
