import { AuthError, type User } from '@supabase/supabase-js';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import HomeScreen from './index';

type SignResult = { error: AuthError | null };
type AuthState = {
  user: User | null;
  signOut: () => Promise<SignResult>;
};

const signOut = jest.fn<Promise<SignResult>, []>();
let mockState: AuthState = { user: null, signOut };

jest.mock('@/stores/authStore', () => ({
  useAuthStore: Object.assign(
    <T,>(selector: (state: AuthState) => T): T => selector(mockState),
    {
      getState: (): AuthState => mockState,
    },
  ),
}));

const fakeUser = { id: 'user-1', email: 'cooper@example.com' } as unknown as User;

describe('HomeScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockState = { user: fakeUser, signOut };
  });

  it("renders the user's email when a user is in the store", () => {
    render(<HomeScreen />);
    expect(screen.getByText('cooper@example.com')).toBeTruthy();
  });

  it('renders a Sign out button that calls signOut when tapped', async () => {
    signOut.mockResolvedValueOnce({ error: null });
    render(<HomeScreen />);

    const button = screen.getByLabelText('Sign out');
    expect(button).toBeTruthy();

    await act(async () => {
      fireEvent.press(button);
    });

    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
