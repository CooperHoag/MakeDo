import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import type { RecipeSuggestion } from '@/types/recipe';

import RecipeDetailScreen from './recipe-detail';

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

let mockParams: { recipeIndex?: string } = {};
const mockReplace = jest.fn();

jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactActual = jest.requireActual<typeof import('react')>('react');
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
    // Avoid unused-import lint complaints inside the mock factory.
    __esModule: true,
    _react: ReactActual,
  };
});

const fakeRecipe = (overrides: Partial<RecipeSuggestion> = {}): RecipeSuggestion => ({
  name: 'Garlic Pasta',
  description: 'A quick weeknight dinner.',
  ingredients_used: [{ name: 'Onions', quantity: 1 }],
  ingredients_needed: ['Olive oil'],
  steps: ['Boil pasta.', 'Sauté onion.', 'Combine.'],
  estimated_minutes: 20,
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
        fakeRecipe({ name: 'Garlic Pasta' }),
        fakeRecipe({ name: 'Onion Soup', description: 'Cozy.' }),
      ],
    });
    mockParams = { recipeIndex: '1' };

    render(<RecipeDetailScreen />);

    expect(screen.getByText('Onion Soup')).toBeTruthy();
    expect(screen.getByText('Cozy.')).toBeTruthy();
    expect(screen.getByText('From your pantry')).toBeTruthy();
    expect(screen.getByText("You'll also need")).toBeTruthy();
    expect(screen.getByText('Steps')).toBeTruthy();
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
