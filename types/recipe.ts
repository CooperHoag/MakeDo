import type { PantryUnit } from '@/types/pantry';

// ---------------------------------------------------------------------------
// Persisted recipe shape — Phase 2 `recipes` table.
// `Recipe` is the single recipe type used everywhere: storage, listing,
// favorites, category filtering, the cooked-this flow, and the Edge Function
// response. `ingredients` and `steps` are stored as `jsonb` server-side and
// hydrated to these shapes in client code.
// ---------------------------------------------------------------------------

export const RECIPE_CATEGORIES = [
  'breakfast',
  'lunch',
  'dinner',
  'dessert',
  'snack',
] as const;

export type RecipeCategory = (typeof RECIPE_CATEGORIES)[number];

export type RecipeIngredient = {
  name: string;
  quantity: number;
  // Null when the AI couldn't emit a unit that fits our allowlist; the
  // cooked-this popup will prompt the user to enter the amount manually.
  unit: PantryUnit | null;
};

export type Recipe = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  category: RecipeCategory;
  ingredients: RecipeIngredient[];
  steps: string[];
  estimated_minutes: number | null;
  is_favorite: boolean;
  created_at: string;
  expires_at: string;
};
