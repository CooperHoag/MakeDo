import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import type { RecipeSuggestion } from '@/types/recipe';

import RecipesScreen from './recipes';

type RecipeActions = {
  fetchRecipes: jest.Mock<Promise<void>, []>;
  clearRecipes: jest.Mock<void, []>;
};

type RecipeState = RecipeActions & {
  recipes: RecipeSuggestion[];
  loading: boolean;
  error: string | null;
  lastFetchedAt: string | null;
};

const mockRecipeActions: RecipeActions = {
  fetchRecipes: jest.fn<Promise<void>, []>(),
  clearRecipes: jest.fn<void, []>(),
};

let mockRecipeState: RecipeState = {
  recipes: [],
  loading: false,
  error: null,
  lastFetchedAt: null,
  ...mockRecipeActions,
};

jest.mock('@/stores/recipeStore', () => ({
  useRecipeStore: Object.assign(
    <T,>(selector: (state: RecipeState) => T): T => selector(mockRecipeState),
    {
      getState: (): RecipeState => mockRecipeState,
    },
  ),
}));

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
}));

const setRecipeState = (overrides: Partial<RecipeState>) => {
  mockRecipeState = { ...mockRecipeState, ...overrides };
};

const fakeRecipe = (overrides: Partial<RecipeSuggestion> = {}): RecipeSuggestion => ({
  name: 'Garlic Pasta',
  description: 'A quick weeknight dinner.',
  ingredients_used: [{ name: 'Onions', quantity: 1 }],
  ingredients_needed: ['Olive oil'],
  steps: ['Boil pasta.', 'Sauté onion.', 'Combine.'],
  estimated_minutes: 20,
  ...overrides,
});

describe('RecipesScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRecipeState = {
      recipes: [],
      loading: false,
      error: null,
      lastFetchedAt: null,
      ...mockRecipeActions,
    };
  });

  it('renders the empty state when there are no recipes and not loading', () => {
    render(<RecipesScreen />);
    expect(screen.getByText('No recipes yet.')).toBeTruthy();
  });

  it('does NOT auto-fetch on mount', () => {
    render(<RecipesScreen />);
    expect(mockRecipeActions.fetchRecipes).not.toHaveBeenCalled();
  });

  it('renders the loading state with the friendly message', () => {
    setRecipeState({ loading: true });
    render(<RecipesScreen />);
    expect(screen.getByLabelText('Loading recipes')).toBeTruthy();
    expect(screen.getByText('Looking through your pantry…')).toBeTruthy();
  });

  it('renders the error state with a Try again button that re-fetches', async () => {
    mockRecipeActions.fetchRecipes.mockResolvedValueOnce(undefined);
    setRecipeState({ error: 'Something went wrong' });
    render(<RecipesScreen />);

    expect(screen.getByText('Something went wrong')).toBeTruthy();
    const retry = screen.getByLabelText('Try again');
    await act(async () => {
      fireEvent.press(retry);
    });

    expect(mockRecipeActions.fetchRecipes).toHaveBeenCalledTimes(1);
  });

  it('renders a list of recipe cards when loaded', () => {
    const recipes = [
      fakeRecipe({ name: 'Garlic Pasta' }),
      fakeRecipe({ name: 'Onion Soup' }),
    ];
    setRecipeState({ recipes });
    render(<RecipesScreen />);

    expect(screen.getByText('Garlic Pasta')).toBeTruthy();
    expect(screen.getByText('Onion Soup')).toBeTruthy();
  });

  it('navigates to the detail screen with the right recipeIndex on card press', async () => {
    const recipes = [
      fakeRecipe({ name: 'Garlic Pasta' }),
      fakeRecipe({ name: 'Onion Soup' }),
    ];
    setRecipeState({ recipes });
    render(<RecipesScreen />);

    const card = screen.getByLabelText('Recipe: Onion Soup');
    await act(async () => {
      fireEvent.press(card);
    });

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/recipe-detail',
      params: { recipeIndex: '1' },
    });
  });
});
