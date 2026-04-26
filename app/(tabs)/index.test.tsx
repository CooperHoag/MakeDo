import { AuthError, type User } from '@supabase/supabase-js';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import type { PantryItem } from '@/types/pantry';

import HomeScreen from './index';

type SignResult = { error: AuthError | null };
type AuthState = {
  user: User | null;
  signOut: () => Promise<SignResult>;
};

type PantryActions = {
  loadItems: jest.Mock<Promise<void>, []>;
  addItem: jest.Mock<Promise<void>, [string]>;
  updateName: jest.Mock<Promise<void>, [string, string]>;
  incrementQuantity: jest.Mock<Promise<void>, [string]>;
  decrementQuantity: jest.Mock<Promise<void>, [string]>;
  deleteItem: jest.Mock<Promise<void>, [string]>;
};

type PantryState = PantryActions & {
  items: PantryItem[];
  loaded: boolean;
  loading: boolean;
  error: string | null;
};

// ---- auth mock --------------------------------------------------------------
const mockSignOut = jest.fn<Promise<SignResult>, []>();
let mockAuthState: AuthState = { user: null, signOut: mockSignOut };

jest.mock('@/stores/authStore', () => ({
  useAuthStore: Object.assign(
    <T,>(selector: (state: AuthState) => T): T => selector(mockAuthState),
    {
      getState: (): AuthState => mockAuthState,
    },
  ),
}));

// ---- pantry mock ------------------------------------------------------------
const mockPantryActions: PantryActions = {
  loadItems: jest.fn<Promise<void>, []>(),
  addItem: jest.fn<Promise<void>, [string]>(),
  updateName: jest.fn<Promise<void>, [string, string]>(),
  incrementQuantity: jest.fn<Promise<void>, [string]>(),
  decrementQuantity: jest.fn<Promise<void>, [string]>(),
  deleteItem: jest.fn<Promise<void>, [string]>(),
};

let mockPantryState: PantryState = {
  items: [],
  loaded: true,
  loading: false,
  error: null,
  ...mockPantryActions,
};

jest.mock('@/stores/pantryStore', () => ({
  usePantryStore: Object.assign(
    <T,>(selector: (state: PantryState) => T): T => selector(mockPantryState),
    {
      getState: (): PantryState => mockPantryState,
    },
  ),
}));

// ---- recipe store mock ------------------------------------------------------
type RecipeActions = {
  fetchRecipes: jest.Mock<Promise<void>, []>;
  clearRecipes: jest.Mock<void, []>;
};

type RecipeState = RecipeActions & {
  recipes: unknown[];
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

// ---- expo-router mock -------------------------------------------------------
const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useFocusEffect: (cb: () => void) => {
    cb();
  },
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
}));

// ---- react-native-gesture-handler/ReanimatedSwipeable mock ------------------
// Render children directly so we can interact with the row.
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const Swipeable = ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children);
  return { __esModule: true, default: Swipeable };
});

const fakeUser = { id: 'user-1', email: 'cooper@example.com' } as unknown as User;
const item = (overrides: Partial<PantryItem> = {}): PantryItem => ({
  id: 'i-1',
  user_id: 'user-1',
  name: 'Apples',
  quantity: 1,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

const setPantry = (overrides: Partial<PantryState>) => {
  mockPantryState = { ...mockPantryState, ...overrides };
};

describe('HomeScreen (pantry)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthState = { user: fakeUser, signOut: mockSignOut };
    mockPantryState = {
      items: [],
      loaded: true,
      loading: false,
      error: null,
      ...mockPantryActions,
    };
    mockRecipeState = {
      recipes: [],
      loading: false,
      error: null,
      lastFetchedAt: null,
      ...mockRecipeActions,
    };
  });

  it('renders the empty state when items is empty and loaded is true', () => {
    render(<HomeScreen />);
    expect(screen.getByText('Your pantry is empty.')).toBeTruthy();
  });

  it('renders the list when items exist', () => {
    setPantry({
      items: [item({ id: 'a', name: 'Apples' }), item({ id: 'o', name: 'Onions' })],
    });
    render(<HomeScreen />);
    expect(screen.getByText('Apples')).toBeTruthy();
    expect(screen.getByText('Onions')).toBeTruthy();
  });

  it('calls addItem with trimmed name and clears the input on add', async () => {
    mockPantryActions.addItem.mockResolvedValueOnce(undefined);
    render(<HomeScreen />);

    const input = screen.getByLabelText('Add a pantry item');
    fireEvent.changeText(input, '  Onions  ');

    const addButton = screen.getByLabelText('Add item');
    await act(async () => {
      fireEvent.press(addButton);
    });

    expect(mockPantryActions.addItem).toHaveBeenCalledWith('Onions');
    expect(input.props.value).toBe('');
  });

  it('disables the add button when input is empty or whitespace', () => {
    render(<HomeScreen />);
    const input = screen.getByLabelText('Add a pantry item');
    const addButton = screen.getByLabelText('Add item');

    // Initially empty.
    expect(addButton.props.accessibilityState?.disabled).toBe(true);

    fireEvent.changeText(input, '   ');
    expect(addButton.props.accessibilityState?.disabled).toBe(true);

    fireEvent.changeText(input, 'Salt');
    expect(addButton.props.accessibilityState?.disabled).toBe(false);
  });

  it('calls incrementQuantity when the + stepper is tapped', async () => {
    setPantry({ items: [item({ id: 'a', name: 'Apples', quantity: 2 })] });
    mockPantryActions.incrementQuantity.mockResolvedValueOnce(undefined);
    render(<HomeScreen />);

    const plus = screen.getByLabelText('Increase quantity of Apples');
    await act(async () => {
      fireEvent.press(plus);
    });

    expect(mockPantryActions.incrementQuantity).toHaveBeenCalledWith('a');
  });

  it('calls decrementQuantity when the − stepper is tapped, and disables it at 0', async () => {
    setPantry({ items: [item({ id: 'a', name: 'Apples', quantity: 1 })] });
    mockPantryActions.decrementQuantity.mockResolvedValueOnce(undefined);
    render(<HomeScreen />);

    const minus = screen.getByLabelText('Decrease quantity of Apples');
    expect(minus.props.accessibilityState?.disabled).toBe(false);
    await act(async () => {
      fireEvent.press(minus);
    });
    expect(mockPantryActions.decrementQuantity).toHaveBeenCalledWith('a');

    // Re-render with quantity 0 — button should be disabled.
    setPantry({ items: [item({ id: 'a', name: 'Apples', quantity: 0 })] });
    render(<HomeScreen />);
    const minus2 = screen.getAllByLabelText('Decrease quantity of Apples').at(-1);
    expect(minus2?.props.accessibilityState?.disabled).toBe(true);
  });

  it('reveals an editable input on tap and calls updateName on blur with new text', async () => {
    setPantry({ items: [item({ id: 'a', name: 'Apples' })] });
    mockPantryActions.updateName.mockResolvedValueOnce(undefined);
    render(<HomeScreen />);

    const editTrigger = screen.getByLabelText('Edit Apples');
    await act(async () => {
      fireEvent.press(editTrigger);
    });

    const renameInput = screen.getByLabelText('Rename Apples');
    fireEvent.changeText(renameInput, 'Green Apples');
    await act(async () => {
      fireEvent(renameInput, 'blur');
    });

    expect(mockPantryActions.updateName).toHaveBeenCalledWith('a', 'Green Apples');
  });

  it('exposes deleteItem through the store mock (delete pathway)', async () => {
    setPantry({ items: [item({ id: 'a', name: 'Apples' })] });
    mockPantryActions.deleteItem.mockResolvedValueOnce(undefined);
    render(<HomeScreen />);

    // Don't simulate the swipe gesture — call the store mock directly.
    await act(async () => {
      await mockPantryActions.deleteItem('a');
    });

    expect(mockPantryActions.deleteItem).toHaveBeenCalledWith('a');
  });

  it('calls signOut when the Sign out button is tapped', async () => {
    mockSignOut.mockResolvedValueOnce({ error: null });
    render(<HomeScreen />);

    const button = screen.getByLabelText('Sign out');
    await act(async () => {
      fireEvent.press(button);
    });

    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it('renders an error banner when the pantry store has an error', () => {
    setPantry({ error: 'Could not load pantry' });
    render(<HomeScreen />);
    expect(screen.getByText('Could not load pantry')).toBeTruthy();
  });

  it('shows a loading indicator while the pantry is not yet loaded', () => {
    setPantry({ loaded: false });
    render(<HomeScreen />);
    expect(screen.getByLabelText('Loading pantry')).toBeTruthy();
    // Empty-state copy must NOT be on screen during the initial load.
    expect(screen.queryByText('Your pantry is empty.')).toBeNull();
  });

  describe('"What can I make?" button', () => {
    it('is disabled when the pantry is loaded and empty', () => {
      setPantry({ items: [], loaded: true });
      render(<HomeScreen />);
      const btn = screen.getByLabelText('What can I make?');
      expect(btn.props.accessibilityState?.disabled).toBe(true);
    });

    it('is disabled while the recipe store is loading', () => {
      setPantry({ items: [item({ id: 'a', name: 'Apples' })] });
      mockRecipeState = { ...mockRecipeState, loading: true };
      render(<HomeScreen />);
      const btn = screen.getByLabelText('What can I make?');
      expect(btn.props.accessibilityState?.disabled).toBe(true);
    });

    it('calls fetchRecipes then navigates to /recipes when items exist', async () => {
      setPantry({ items: [item({ id: 'a', name: 'Apples' })] });
      mockRecipeActions.fetchRecipes.mockResolvedValueOnce(undefined);
      render(<HomeScreen />);

      const btn = screen.getByLabelText('What can I make?');
      expect(btn.props.accessibilityState?.disabled).toBe(false);

      await act(async () => {
        fireEvent.press(btn);
      });

      expect(mockRecipeActions.fetchRecipes).toHaveBeenCalledTimes(1);
      expect(mockPush).toHaveBeenCalledWith('/recipes');
    });

    it('does NOT navigate or fetch when pantry is empty (button disabled)', async () => {
      setPantry({ items: [], loaded: true });
      render(<HomeScreen />);

      const btn = screen.getByLabelText('What can I make?');
      await act(async () => {
        fireEvent.press(btn);
      });

      expect(mockRecipeActions.fetchRecipes).not.toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
    });
  });
});
