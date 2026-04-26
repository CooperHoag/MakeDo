import type { Recipe } from '@/types/recipe';

type InvokeResult = { data: unknown; error: unknown };

const mockInvoke = jest.fn<Promise<InvokeResult>, [string]>();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    functions: {
      invoke: (name: string) => mockInvoke(name),
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
  name: 'Garlic Onion Pasta',
  description: 'Quick weeknight pasta with what you have.',
  ingredients_used: [{ name: 'Onions', quantity: 1 }],
  ingredients_needed: ['Olive oil', 'Salt'],
  steps: ['Boil pasta.', 'Sauté onion.', 'Toss together.'],
  estimated_minutes: 20,
  ...overrides,
});

describe('recipeStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('fetchRecipes', () => {
    it('populates recipes, sets lastFetchedAt, and clears loading on success', async () => {
      const recipes = [fakeRecipe()];
      mockInvoke.mockResolvedValueOnce({ data: { recipes }, error: null });

      const useStore = loadStore();
      const before = new Date('2026-01-01T00:00:00.000Z').getTime();
      jest.spyOn(Date, 'now').mockReturnValue(before);

      await useStore.getState().fetchRecipes();

      const state = useStore.getState();
      expect(state.recipes).toEqual(recipes);
      expect(state.loading).toBe(false);
      expect(state.error).toBeNull();
      expect(state.lastFetchedAt).not.toBeNull();
      expect(mockInvoke).toHaveBeenCalledWith('suggest-recipes');
    });

    it('extracts the friendly error string from the response body when provided', async () => {
      mockInvoke.mockResolvedValueOnce({
        data: {
          error: "You've used your 10 daily recipe suggestions. Try again tomorrow.",
        },
        error: { message: 'FunctionsHttpError: 429' },
      });

      const useStore = loadStore();
      await useStore.getState().fetchRecipes();

      const state = useStore.getState();
      expect(state.recipes).toEqual([]);
      expect(state.loading).toBe(false);
      expect(state.error).toBe(
        "You've used your 10 daily recipe suggestions. Try again tomorrow.",
      );
    });

    it('falls back to a generic message when the body has no error string', async () => {
      mockInvoke.mockResolvedValueOnce({
        data: null,
        error: { /* no message field */ },
      });

      const useStore = loadStore();
      await useStore.getState().fetchRecipes();

      const state = useStore.getState();
      expect(state.error).toBe('Could not get recipe ideas. Please try again.');
      expect(state.loading).toBe(false);
    });

    it('falls back to a generic message when invoke succeeds but body shape is wrong', async () => {
      mockInvoke.mockResolvedValueOnce({ data: { recipes: 'not an array' }, error: null });

      const useStore = loadStore();
      await useStore.getState().fetchRecipes();

      const state = useStore.getState();
      expect(state.recipes).toEqual([]);
      expect(state.error).toBe('Could not get recipe ideas. Please try again.');
    });

    it('catches a thrown exception and sets the error to the exception message', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('network down'));

      const useStore = loadStore();
      await useStore.getState().fetchRecipes();

      const state = useStore.getState();
      expect(state.error).toBe('network down');
      expect(state.loading).toBe(false);
    });

    it('falls back to a generic message when the thrown value has no message', async () => {
      mockInvoke.mockRejectedValueOnce({ /* no message field */ });

      const useStore = loadStore();
      await useStore.getState().fetchRecipes();

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
