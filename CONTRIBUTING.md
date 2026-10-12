# Contributing to rxcheck-india

Thanks for considering a contribution — this project only gets more useful
if more people who actually see Indian prescriptions day to day (pharmacists,
clinicians, clinic/pharmacy software builders) help expand and correct it.

## The one rule that matters more than any other

This is health-safety-adjacent data. **A wrong entry is worse than a missing
one.** A missing brand just means the tool says "I don't know this drug." A
wrong interaction severity, or a wrong generic mapping, could give someone
false confidence about something unsafe. So:

- Cite something for anything non-obvious: a package insert, CDSCO listing,
  a standard pharmacology reference, or at minimum "this is common clinical
  knowledge, here's why." "I think this is right" is not enough for a merge.
- If you're not sure, open an issue to discuss instead of a PR to merge.
- Prefer leaving an entry out over guessing.

## Ways to contribute

### 1. Add or correct a brand → generic mapping

Edit `data/brand-to-generic.json`. Each entry:

```json
{
  "brand": "ExampleBrand",
  "genericNames": ["Generic Ingredient Name"],
  "combination": false,
  "notes": "optional — e.g. common strength, route, or category"
}
```

- `combination: true` only when the product genuinely combines 2+ *different*
  active ingredients (not salt-form variants of the same drug — see
  `scripts/README.md` for why that distinction matters, it's a real bug we
  hit and fixed).
- Use the generic/INN name exactly as it appears elsewhere in the dataset
  where possible (check `data/interactions.json` too) so interaction lookups
  actually connect brand → generic → known interaction.
- Double-check current formulation — Indian brand names are sometimes reused
  across different products over time, or discontinued.

### 2. Add or correct a drug-drug interaction

Edit `data/interactions.json`. Each entry:

```json
{
  "a": "GenericNameA",
  "b": "GenericNameB",
  "severity": "major | moderate | minor",
  "mechanism": "short explanation of why they interact",
  "recommendation": "what a clinician would actually do about it"
}
```

Please include a source in your PR description (a reference, not necessarily
in the JSON itself) — this is the highest-stakes file in the repo.

### 3. Report a wrong entry

Even if you can't fix it yourself, opening an issue flagging a wrong or
outdated entry is genuinely valuable — see the issue templates under
`.github/ISSUE_TEMPLATE/`.

### 4. Code contributions

The core library (`src/index.js`), the reference server (`server.js`,
`middleware/`), and the import scripts (`scripts/`) are normal JS — PRs
welcome for bugs, tests, performance, or new features (e.g. dosage-range
checks, additional data-import scripts). Please add/update tests in `test/`
for any behavior change — run `npm test` before opening a PR.

## Review process

Data PRs (brand mappings, interactions) ideally get a second pair of eyes
from someone with clinical/pharmacology background before merge, given the
safety-sensitivity. If you have that background and want to help review
others' PRs rather than submit your own, that's just as valuable — say so
in an issue.

## Code of conduct

Be kind, assume good faith, and remember the actual stakes here: this data
could end up informing a real medication safety check for a real patient
somewhere. That's worth getting right over getting fast.
