const {
  lookupBrand,
  resolveToGeneric,
  checkInteractions,
  addBrandMapping,
  addInteraction,
  isKnownGeneric,
} = require('../src/index');

describe('lookupBrand', () => {
  test('finds a known brand case-insensitively', () => {
    expect(lookupBrand('ecosprin')).not.toBeNull();
    expect(lookupBrand('ECOSPRIN')).not.toBeNull();
    expect(lookupBrand('  Ecosprin  ')).not.toBeNull();
  });

  test('returns null for unknown brand', () => {
    expect(lookupBrand('NotARealDrugXYZ')).toBeNull();
  });

  test('returns combination ingredients for a combo brand', () => {
    const entry = lookupBrand('Combiflam');
    expect(entry.genericNames.sort()).toEqual(['Ibuprofen', 'Paracetamol'].sort());
    expect(entry.combination).toBe(true);
  });
});

describe('resolveToGeneric', () => {
  test('resolves a brand to its generic name(s)', () => {
    const res = resolveToGeneric('Crocin');
    expect(res.genericNames).toEqual(['Paracetamol']);
    expect(res.resolvedFrom).toBe('brand');
  });

  test('assumes an unrecognized name is already generic', () => {
    const res = resolveToGeneric('Warfarin');
    expect(res.genericNames).toEqual(['Warfarin']);
    expect(res.resolvedFrom).toBe('assumed-generic');
  });
});

describe('checkInteractions', () => {
  test('flags a known major interaction between two brand names', () => {
    // Ecosprin -> Aspirin, Warf -> Warfarin: documented major interaction
    const result = checkInteractions(['Ecosprin', 'Warf']);
    expect(result.interactions.length).toBeGreaterThanOrEqual(1);
    const hit = result.interactions[0];
    expect(hit.severity).toBe('major');
    expect([hit.genericA, hit.genericB].sort()).toEqual(['Aspirin', 'Warfarin'].sort());
  });

  test('works with generic names directly, not just brands', () => {
    const result = checkInteractions(['Warfarin', 'Aspirin']);
    expect(result.interactions.length).toBe(1);
    expect(result.interactions[0].severity).toBe('major');
  });

  test('expands a combination brand into its individual actives for checking', () => {
    // Ecosprin AV = Aspirin + Atorvastatin. Pair with Clarithromycin (not in seed brand map,
    // so treated as generic) should flag the Atorvastatin x Clarithromycin interaction.
    const result = checkInteractions(['Ecosprin AV', 'Clarithromycin']);
    const hit = result.interactions.find(
      (i) => [i.genericA, i.genericB].sort().join(',') === ['Atorvastatin', 'Clarithromycin'].sort().join(',')
    );
    expect(hit).toBeDefined();
    expect(hit.severity).toBe('major');
  });

  test('returns no interactions for an empty or non-interacting list', () => {
    const result = checkInteractions(['Crocin', 'Thyronorm']);
    expect(result.interactions).toEqual([]);
  });

  test('handles a single drug with no pairs gracefully', () => {
    const result = checkInteractions(['Crocin']);
    expect(result.interactions).toEqual([]);
    expect(result.resolved.length).toBe(1);
  });

  test('rejects non-array input', () => {
    expect(() => checkInteractions('Crocin')).toThrow(TypeError);
  });

  test('tracks unknown brand names separately from known generics', () => {
    const result = checkInteractions(['NotARealDrugXYZ', 'Crocin']);
    expect(result.unknownBrands).toContain('NotARealDrugXYZ');
  });

  test('sorts interactions with major severity first', () => {
    const result = checkInteractions(['Warfarin', 'Aspirin', 'Clopidogrel', 'Omeprazole']);
    const severities = result.interactions.map((i) => i.severity);
    const firstModerateIdx = severities.indexOf('moderate');
    const lastMajorIdx = severities.lastIndexOf('major');
    if (firstModerateIdx !== -1 && lastMajorIdx !== -1) {
      expect(lastMajorIdx).toBeLessThan(firstModerateIdx === -1 ? Infinity : severities.length);
      expect(severities.indexOf('major')).toBeLessThanOrEqual(firstModerateIdx);
    }
  });
});

describe('extensibility', () => {
  test('addBrandMapping lets consumers add their own brand without forking', () => {
    addBrandMapping({ brand: 'TotallyMadeUpBrand', genericNames: ['Aspirin'] });
    const entry = lookupBrand('TotallyMadeUpBrand');
    expect(entry.genericNames).toEqual(['Aspirin']);
  });

  test('addInteraction lets consumers add their own interaction record', () => {
    addInteraction({
      a: 'FooDrug',
      b: 'BarDrug',
      severity: 'moderate',
      mechanism: 'test mechanism',
      recommendation: 'test recommendation',
    });
    const result = checkInteractions(['FooDrug', 'BarDrug']);
    expect(result.interactions.length).toBe(1);
    expect(isKnownGeneric('FooDrug')).toBe(true);
  });
});
