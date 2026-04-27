import canonicalFoods from '@/assets/data/canonical-foods.json';
import type { CanonicalFood } from '@/types/canonical-food';
import { PANTRY_UNITS } from '@/types/pantry';

const foods = canonicalFoods as CanonicalFood[];

describe('canonical-foods.json', () => {
  it('has more than 100 entries', () => {
    expect(foods.length).toBeGreaterThan(100);
  });

  it('every entry has all four required fields populated', () => {
    for (const food of foods) {
      expect(typeof food.name).toBe('string');
      expect(food.name.length).toBeGreaterThan(0);

      expect(typeof food.normalized_name).toBe('string');
      expect(food.normalized_name.length).toBeGreaterThan(0);

      expect(typeof food.default_unit).toBe('string');
      expect(food.default_unit.length).toBeGreaterThan(0);

      expect(typeof food.category).toBe('string');
      expect(food.category.length).toBeGreaterThan(0);
    }
  });

  it('every default_unit is in PANTRY_UNITS', () => {
    const allowed = new Set<string>(PANTRY_UNITS);
    for (const food of foods) {
      expect(allowed.has(food.default_unit)).toBe(true);
    }
  });

  it('every normalized_name is lowercase trimmed', () => {
    for (const food of foods) {
      expect(food.normalized_name).toBe(food.normalized_name.toLowerCase());
      expect(food.normalized_name).toBe(food.normalized_name.trim());
    }
  });

  it('is sorted alphabetically by normalized_name', () => {
    const names = foods.map((f) => f.normalized_name);
    const sorted = [...names].sort();
    expect(names).toEqual(sorted);
  });

  it('has no duplicate normalized_name entries', () => {
    const names = foods.map((f) => f.normalized_name);
    expect(new Set(names).size).toBe(names.length);
  });
});
