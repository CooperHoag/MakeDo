import { PANTRY_UNITS } from '@/types/pantry';

describe('PANTRY_UNITS', () => {
  it('contains exactly the 11 allowed units', () => {
    expect(PANTRY_UNITS).toHaveLength(11);
  });

  it('includes count', () => {
    expect(PANTRY_UNITS).toContain('count');
  });

  it('includes oz', () => {
    expect(PANTRY_UNITS).toContain('oz');
  });

  it('includes lb', () => {
    expect(PANTRY_UNITS).toContain('lb');
  });

  it('includes g', () => {
    expect(PANTRY_UNITS).toContain('g');
  });

  it('includes kg', () => {
    expect(PANTRY_UNITS).toContain('kg');
  });

  it('includes fl_oz', () => {
    expect(PANTRY_UNITS).toContain('fl_oz');
  });

  it('includes cup', () => {
    expect(PANTRY_UNITS).toContain('cup');
  });

  it('includes tbsp', () => {
    expect(PANTRY_UNITS).toContain('tbsp');
  });

  it('includes tsp', () => {
    expect(PANTRY_UNITS).toContain('tsp');
  });

  it('includes ml', () => {
    expect(PANTRY_UNITS).toContain('ml');
  });

  it('includes L', () => {
    expect(PANTRY_UNITS).toContain('L');
  });

  it('has no duplicate entries', () => {
    expect(new Set(PANTRY_UNITS).size).toBe(PANTRY_UNITS.length);
  });
});
