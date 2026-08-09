import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import type { Recipe, RecipeCategory } from '@/types/recipe';

import RecipeDetailScreen from './recipe-detail';

type RecipeActions = {
  fetchRecipes: jest.Mock<Promise<void>, [RecipeCategory]>;
  clearRecipes: jest.Mock<void, []>;
};

type RecipeState = RecipeActions & {
  recipes: Recipe[];
  loading: boolean;
  error: string | null;
  lastFetchedAt: string | null;
};

const mockRecipeActions: RecipeActions = {
  fetchRecipes: jest.fn<Promise<void>, [RecipeCategory]>(),
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

let mockParams: { recipeIndex?: string } = {};
const mockReplace = jest.fn();

jest.mock('expo-router', () => {
  const StackScreen = () => null;
  const Stack = { Screen: StackScreen };
  return {
    Stack,
    useLocalSearchParams: () => mockParams,
    useRouter: () => ({
      push: jest.fn(),
      replace: mockReplace,
      back: jest.fn(),
    }),
    __esModule: true,
  };
});

const fakeRecipe = (overrides: Partial<Recipe> = {}): Recipe => ({
  id: 'r-1',
  user_id: 'user-1',
  name: 'Garlic Pasta',
  description: 'A quick weeknight dinner.',
  category: 'dinner',
  ingredients: [
    { name: 'Onions', quantity: 1, unit: 'count' },
    { name: 'Rice', quantity: 8, unit: 'oz' },
    { name: 'Salt', quantity: 1, unit: null },
  ],
  steps: ['Boil pasta.', 'Sauté onion.', 'Combine.'],
  estimated_minutes: 20,
  is_favorite: false,
  created_at: '2026-01-01T00:00:00.000Z',
  expires_at: '2026-01-15T00:00:00.000Z',
  ...overrides,
});

const setRecipeState = (overrides: Partial<RecipeState>) => {
  mockRecipeState = { ...mockRecipeState, ...overrides };
};

describe('RecipeDetailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRecipeState = {
      recipes: [],
      loading: false,
      error: null,
      lastFetchedAt: null,
      ...mockRecipeActions,
    };
    mockParams = {};
  });

  it('renders the selected recipe when recipeIndex is valid', () => {
    setRecipeState({
      recipes: [
        fakeRecipe({ id: 'a', name: 'Garlic Pasta' }),
        fakeRecipe({ id: 'b', name: 'Onion Soup', description: 'Cozy.' }),
      ],
    });
    mockParams = { recipeIndex: '1' };

    render(<RecipeDetailScreen />);

    expect(screen.getByText('Onion Soup')).toBeTruthy();
    expect(screen.getByText('Cozy.')).toBeTruthy();
    expect(screen.getByText('Ingredients')).toBeTruthy();
    expect(screen.getByText('Steps')).toBeTruthy();
  });

  it('renders ingredients as "{quantity} {unit} {name}" and omits unit when null', () => {
    setRecipeState({ recipes: [fakeRecipe({ id: 'a' })] });
    mockParams = { recipeIndex: '0' };

    render(<RecipeDetailScreen />);

    expect(screen.getByText('1 count Onions')).toBeTruthy();
    expect(screen.getByText('8 oz Rice')).toBeTruthy();
    expect(screen.getByText('1 Salt')).toBeTruthy();
  });

  it('does NOT render legacy "From your pantry" or "You\'ll also need" sections', () => {
    setRecipeState({ recipes: [fakeRecipe({ id: 'a' })] });
    mockParams = { recipeIndex: '0' };

    render(<RecipeDetailScreen />);

    expect(screen.queryByText('From your pantry')).toBeNull();
    expect(screen.queryByText("You'll also need")).toBeNull();
  });

  it('renders the fallback when recipeIndex is out of bounds', () => {
    setRecipeState({ recipes: [fakeRecipe()] });
    mockParams = { recipeIndex: '5' };

    render(<RecipeDetailScreen />);

    expect(screen.getByText('Recipe not available.')).toBeTruthy();
    expect(screen.getByLabelText('Back to pantry')).toBeTruthy();
  });

  it('renders the fallback when recipeIndex is missing or unparseable', () => {
    setRecipeState({ recipes: [fakeRecipe()] });
    mockParams = { recipeIndex: 'not-a-number' };

    render(<RecipeDetailScreen />);

    expect(screen.getByText('Recipe not available.')).toBeTruthy();
  });

  it('navigates back to root when "Back to pantry" is tapped on fallback', async () => {
    setRecipeState({ recipes: [] });
    mockParams = { recipeIndex: '0' };

    render(<RecipeDetailScreen />);

    const back = screen.getByLabelText('Back to pantry');
    await act(async () => {
      fireEvent.press(back);
    });

    expect(mockReplace).toHaveBeenCalledWith('/');
  });
});
