# Coverage-expansion scripts

The honest answer to "cover all meds in India and outside" is that it can't
be hand-typed into a JSON file reliably — drug interaction and brand data
is exactly the kind of thing that causes real harm if it's subtly wrong, so
it needs to come from verified sources, not guesswork. These scripts pull
from real, citable sources instead.

## Why these are scripts you run, not data shipped directly

RxNorm, openFDA, and DDInter are all useful open sources, but hitting their
live APIs isn't something to bake into the package itself — results should
be reviewed before they land in `data/`. So these scripts write to a
separate `*.import.json` file for review, rather than overwriting the
curated dataset directly.

## What's here

- **`fetch-rxnorm-generics.js`** — queries RxNorm (US NLM, free, no API key)
  to resolve drug names to generic/ingredient names. Good for broad,
  international generic-name coverage, since active ingredients are the
  same chemical worldwide even when brand names differ by country. Forces
  IPv4 resolution (`dns.setDefaultResultOrder('ipv4first')`), since some
  networks have flaky IPv6 routing that makes Node's DNS lookups fail even
  when `curl` succeeds fine on the same machine.

## What's still needed (not yet scripted)

- **India-specific brand coverage.** There isn't a clean, free, bulk-
  downloadable, authoritative brand-name database for the Indian market
  the way RxNorm exists for the US (see test result below — RxNorm itself
  doesn't cover this). Realistic paths, roughly cheapest to most expensive:
  1. Crowd-source via GitHub issues/PRs from people who actually see Indian
     prescriptions day to day (pharmacists, clinic software builders).
  2. Check CDSCO (Central Drugs Standard Control Organisation) and state
     drug control department public registers for anything machine-
     readable — coverage and format vary and need to be checked by hand.
  3. License a commercial Indian drug compendium (e.g. CIMS, MIMS India) —
     costs money and their data typically can't be redistributed in an
     open-source package, so this would have to live behind a paid API
     tier rather than in the public repo.

- **Interaction data beyond the seed set.** DDInter (ddinter.scbdd.com) is
  an open academic drug-drug interaction database — worth checking its
  terms and, if it offers a bulk download, writing an import script similar
  to the RxNorm one above. Not yet scripted — verify its current API/
  download shape before building against it, since academic sites change
  structure without much notice.

- **Clinical review.** Whatever gets imported automatically still needs a
  pharmacist or clinician to sanity-check severity labels and
  recommendations before this goes anywhere near production. Automated
  import solves coverage breadth, not correctness.

## How to run

```bash
# 1. Make a plain-text list of drug names, one per line
echo -e "Metformin\nAtorvastatin\nIbuprofen" > my-drugs.txt

# 2. Run the importer (needs real internet access)
node scripts/fetch-rxnorm-generics.js my-drugs.txt

# 3. Review data/brand-to-generic.rxnorm-import.json, then hand-merge
#    entries you trust into data/brand-to-generic.json
```

## Test result: RxNorm does not cover Indian brand names

Tested (2026-10) against 8 common Indian brands (Glycomet, Crocin,
Dolo 650, Combiflam, Ecosprin, Augmentin, Pantocid, Thyronorm):

- 6/8 (75%): no match at all.
- 1/8: a WRONG result (`Crocin -> crocin` — RxNorm has no idea Crocin is
  paracetamol, and returned a nonsense self-referential "ingredient" that
  would have been a bad entry if merged automatically without review).
- 1/8: a correct result (`Augmentin -> amoxicillin, clavulanate`) — but
  only because Augmentin happens to be sold under the same brand name in
  the US too. Not evidence of real India coverage.

**Conclusion: don't use this script to try to resolve Indian brand names.**
It's useful for validating/expanding *generic* ingredient names (the
"outside India" half of the coverage problem), and for globally-shared
brands, but it is not a path to Indian brand coverage. That part still
needs the community-contribution / CDSCO-register path described above.
Always hand-review anything before merging it into `data/brand-to-generic.json`
regardless of source — this test is a concrete example of why.
