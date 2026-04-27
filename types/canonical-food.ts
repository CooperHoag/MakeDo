import type { PantryUnit } from '@/types/pantry';

// Internal classification used to weight autocomplete and (later) inform
// the AI's category context. Not surfaced in the UI.
export const CANONICAL_FOOD_CATEGORIES = [
  'protein',
  'produce',
  'dairy',
  'grain',
  'baking',
  'condiment',
  'spice',
  'oil',
  'beverage',
  'canned',
  'frozen',
  'snack',
  'other',
] as const;

export type CanonicalFoodCategory = (typeof CANONICAL_FOOD_CATEGORIES)[number];

export type CanonicalFood = {
  // Title Case display name (e.g. "Olive Oil").
  name: string;
  // Lowercase trimmed match key (e.g. "olive oil").
  normalized_name: string;
  // Sensible default unit when the user picks this food.
  default_unit: PantryUnit;
  // Internal classification.
  category: CanonicalFoodCategory;
};
