export const PANTRY_UNITS = [
  'count',
  'oz',
  'lb',
  'g',
  'kg',
  'fl_oz',
  'cup',
  'tbsp',
  'tsp',
  'ml',
  'L',
] as const;

export type PantryUnit = (typeof PANTRY_UNITS)[number];

export type PantryItem = {
  id: string;
  user_id: string;
  name: string;
  normalized_name: string;
  quantity: number;
  unit: PantryUnit;
  created_at: string;
  updated_at: string;
};
