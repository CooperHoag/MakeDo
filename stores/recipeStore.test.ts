import type { Recipe, RecipeCategory } from '@/types/recipe';

type InvokeArgs = { body?: unknown };
type InvokeResult = { data: unknown; error: unknown };

const mockInvoke = jest.fn<Promise<InvokeResult>, [string, InvokeArgs?]>();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    functions: {
      invoke: (name: string, args?: InvokeArgs) => mockInvoke(name, args),
    },
  },
}));

const loadStore = (): typeof import('./recipeStore').useRecipeStore => {
  let store: typeof import('./recipeStore').useRecipeStore | undefined;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('./recipeStore') as typeof import('./recipeStore');
    store = mod.useRecipeStore;
  });
  if (!store) {
    throw new Error('Failed to load recipeStore module');
  }
  return store;
};

const fakeRecipe = (overrides: Partial<Recipe> = {}): Recipe => ({
  id: 'r-1',
  user_id: 'user-1',
  name: 'Garlic Onion Pasta',
  description: 'Quick weeknight pasta with what you have.',
  category: 'dinner',
  ingredients: [{ name: 'Onions', quantity: 1, unit: 'count' }],
  steps: ['Boil pasta.', 'Sauté onion.', 'Toss together.'],
  estimated_minutes: 20,
  is_favorite: false,
  created_at: '2026-01-01T00:00:00.000Z',
  expires_at: '2026-01-15T00:00:00.000Z',
  ...overrides,
});

const fourRecipes = (): Recipe[] => [
  fakeRecipe({ id: 'r-1', name: 'Recipe One' }),
  fakeRecipe({ id: 'r-2', name: 'Recipe Two' }),
  fakeRecipe({ id: 'r-3', name: 'Recipe Three' }),
  fakeRecipe({ id: 'r-4', name: 'Recipe Four' }),
];

const DINNER: RecipeCategory = 'dinner';

describe('recipeStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('fetchRecipes', () => {
    it('passes the chosen category to the Edge Function and populates state on success', async () => {
      const recipes = fourRecipes();
      mockInvoke.mockResolvedValueOnce({ data: { recipes }, error: null });

      const useStore = loadStore();
      await useStore.getState().fetchRecipes(DINNER);

      const state = useStore.getState();
      expect(state.recipes).toEqual(recipes);
      expect(state.loading).toBe(false);
      expect(state.error).toBeNull();
      expect(state.lastFetchedAt).not.toBeNull();
      expect(mockInvoke).toHaveBeenCalledWith('suggest-recipes', {
        body: { category: 'dinner' },
      });
    });

    it('passes a non-default category through unchanged', async () => {
      const recipes = fourRecipes();
      mockInvoke.mockResolvedValueOnce({ data: { recipes }, error: null });

      const useStore = loadStore();
      await useStore.getState().fetchRecipes('breakfast');

      expect(mockInvoke).toHaveBeenCalledWith('suggest-recipes', {
        body: { category: 'breakfast' },
      });
    });

    it('extracts the friendly error string from the response body when provided (429 rate limit)', async () => {
      mockInvoke.mockResolvedValueOnce({
        data: {
          error: "You've used your 10 daily recipe suggestions. Try again tomorrow.",
        },
        error: { message: 'FunctionsHttpError: 429' },
      });

      const useStore = loadStore();
      await useStore.getState().fetchRecipes(DINNER);

      const state = useStore.getState();
      expect(state.recipes).toEqual([]);
      expect(state.loading).toBe(false);
      expect(state.error).toBe(
        "You've used your 10 daily recipe suggestions. Try again tomorrow.",
      );
    });

    it('surfaces the friendly persistence-failure message on 500', async () => {
      mockInvoke.mockResolvedValueOnce({
        data: { error: 'Saved recipes failed to persist. Please try again.' },
        error: { message: 'FunctionsHttpError: 500' },
      });

      const useStore = loadStore();
      await useStore.getState().fetchRecipes(DINNER);

      const state = useStore.getState();
      expect(state.error).toBe(
        'Saved recipes failed to persist. Please try again.',
      );
      expect(state.recipes).toEqual([]);
    });

    it('does not overwrite existing recipes on 500 — keeps the previously fetched list', async () => {
      // First call: success — populate state with 4 recipes.
      const recipes = fourRecipes();
      mockInvoke.mockResolvedValueOnce({ data: { recipes }, error: null });

      const useStore = loadStore();
      await useStore.getState().fetchRecipes(DINNER);
      expect(useStore.getState().recipes).toEqual(recipes);

      // Second call: 500 — recipes must be preserved, error must surface.
      mockInvoke.mockResolvedValueOnce({
        data: { error: 'Saved recipes failed to persist. Please try again.' },
        error: { message: 'FunctionsHttpError: 500' },
      });
      await useStore.getState().fetchRecipes(DINNER);

      const state = useStore.getState();
      expect(state.recipes).toEqual(recipes);
      expect(state.error).toBe(
        'Saved recipes failed to persist. Please try again.',
      );
      expect(state.loading).toBe(false);
    });

    it('falls back to a generic message when the body has no error string', async () => {
      mockInvoke.mockResolvedValueOnce({
        data: null,
        error: { /* no message field */ },
      });

      const useStore = loadStore();
      await useStore.getState().fetchRecipes(DINNER);

      const state = useStore.getState();
      expect(state.error).toBe('Could not get recipe ideas. Please try again.');
      expect(state.loading).toBe(false);
    });

    it('falls back to a generic message when invoke succeeds but body shape is wrong', async () => {
      mockInvoke.mockResolvedValueOnce({ data: { recipes: 'not an array' }, error: null });

      const useStore = loadStore();
      await useStore.getState().fetchRecipes(DINNER);

      const state = useStore.getState();
      expect(state.recipes).toEqual([]);
      expect(state.error).toBe('Could not get recipe ideas. Please try again.');
    });

    it('catches a thrown exception and sets the error to the exception message', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('network down'));

      const useStore = loadStore();
      await useStore.getState().fetchRecipes(DINNER);

      const state = useStore.getState();
      expect(state.error).toBe('network down');
      expect(state.loading).toBe(false);
    });

    it('falls back to a generic message when the thrown value has no message', async () => {
      mockInvoke.mockRejectedValueOnce({ /* no message field */ });

      const useStore = loadStore();
      await useStore.getState().fetchRecipes(DINNER);

      const state = useStore.getState();
      expect(state.error).toBe('Could not get recipe ideas. Please try again.');
      expect(state.loading).toBe(false);
    });
  });

  describe('clearRecipes', () => {
    it('resets recipes, error, and lastFetchedAt', () => {
      const useStore = loadStore();
      useStore.setState({
        recipes: [fakeRecipe()],
        error: 'old error',
        lastFetchedAt: '2026-01-01T00:00:00.000Z',
        loading: false,
      });

      useStore.getState().clearRecipes();

      const state = useStore.getState();
      expect(state.recipes).toEqual([]);
      expect(state.error).toBeNull();
      expect(state.lastFetchedAt).toBeNull();
      expect(state.loading).toBe(false);
    });
  });
});
