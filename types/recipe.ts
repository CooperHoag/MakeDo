import type { PantryUnit } from '@/types/pantry';

// ---------------------------------------------------------------------------
// Persisted recipe shape — Phase 2 `recipes` table.
// Used for storage, listing, favorites, category filtering, the cooked-this
// flow, and any other server-truth recipe operation.
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

// ---------------------------------------------------------------------------
// Legacy in-memory recipe shape (Phase 1 Edge Function wire format).
// Kept as `RecipeSuggestion` until Task #2 rewrites the Edge Function and
// unifies on the persisted shape. The Phase 1 recipeStore + recipe-detail
// screen continue to use this until then.
// ---------------------------------------------------------------------------

export type RecipeSuggestionIngredientUsed = {
  name: string;
  quantity: number;
};

export type RecipeSuggestion = {
  name: string;
  description: string;
  ingredients_used: RecipeSuggestionIngredientUsed[];
  ingredients_needed: string[];
  steps: string[];
  estimated_minutes: number;
};
