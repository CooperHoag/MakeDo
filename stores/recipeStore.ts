import { create } from 'zustand';

import { supabase } from '@/lib/supabase';
import type { RecipeSuggestion } from '@/types/recipe';

type RecipeState = {
  recipes: RecipeSuggestion[];
  loading: boolean;
  error: string | null;
  lastFetchedAt: string | null;
  fetchRecipes: () => Promise<void>;
  clearRecipes: () => void;
};

const GENERIC_ERROR = 'Could not get recipe ideas. Please try again.';

const stringFromUnknown = (value: unknown): string | null => {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  return null;
};

const extractErrorMessage = (
  responseError: unknown,
  responseData: unknown,
): string => {
  // supabase.functions.invoke surfaces non-2xx responses on `error` (a
  // FunctionsHttpError) and still parses the body into `data`. Prefer the
  // server's friendly `error` string from the body.
  if (responseData && typeof responseData === 'object') {
    const fromBody = stringFromUnknown(
      (responseData as { error?: unknown }).error,
    );
    if (fromBody) return fromBody;
  }
  if (responseError && typeof responseError === 'object') {
    const fromError = stringFromUnknown(
      (responseError as { message?: unknown }).message,
    );
    if (fromError) return fromError;
  }
  return GENERIC_ERROR;
};

export const useRecipeStore = create<RecipeState>((set) => ({
  recipes: [],
  loading: false,
  error: null,
  lastFetchedAt: null,

  fetchRecipes: async () => {
    set({ loading: true, error: null });
    try {
      const { data, error } = await supabase.functions.invoke('suggest-recipes');
      if (error) {
        set({ loading: false, error: extractErrorMessage(error, data) });
        return;
      }
      const recipes = (data as { recipes?: unknown } | null)?.recipes;
      if (!Array.isArray(recipes)) {
        set({ loading: false, error: GENERIC_ERROR });
        return;
      }
      set({
        recipes: recipes as RecipeSuggestion[],
        lastFetchedAt: new Date().toISOString(),
        loading: false,
        error: null,
      });
    } catch (err) {
      set({ loading: false, error: extractErrorMessage(err, null) });
    }
  },

  clearRecipes: () => {
    set({ recipes: [], loading: false, error: null, lastFetchedAt: null });
  },
}));
