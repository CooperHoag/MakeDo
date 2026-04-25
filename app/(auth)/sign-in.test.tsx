import { AuthError } from '@supabase/supabase-js';
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import SignInScreen from './sign-in';

type SignResult = { error: AuthError | null };

const mockSignIn = jest.fn<Promise<SignResult>, [string, string]>();
const mockSignUp = jest.fn<Promise<SignResult>, [string, string]>();
const mockSignOut = jest.fn<Promise<SignResult>, []>();

jest.mock('@/stores/authStore', () => ({
  useAuthStore: {
    getState: () => ({
      signIn: mockSignIn,
      signUp: mockSignUp,
      signOut: mockSignOut,
    }),
  },
}));

jest.mock('expo-router', () => {
  const ReactLib = require('react') as typeof import('react');
  const { Text } = require('react-native') as typeof import('react-native');
  return {
    Link: ({
      children,
      accessibilityLabel,
    }: {
      children: React.ReactNode;
      accessibilityLabel?: string;
    }) => ReactLib.createElement(Text, { accessibilityLabel }, children),
  };
});

describe('SignInScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the email input, password input, and sign-in button', () => {
    render(<SignInScreen />);

    expect(screen.getByLabelText('Email')).toBeTruthy();
    expect(screen.getByLabelText('Password')).toBeTruthy();
    expect(screen.getByLabelText('Sign in')).toBeTruthy();
  });

  it('passes the typed email and password to signIn when the button is tapped', async () => {
    mockSignIn.mockResolvedValueOnce({ error: null });
    render(<SignInScreen />);

    fireEvent.changeText(screen.getByLabelText('Email'), 'user@example.com');
    fireEvent.changeText(screen.getByLabelText('Password'), 'hunter2!');
    fireEvent.press(screen.getByLabelText('Sign in'));

    await Promise.resolve();
    await Promise.resolve();

    expect(mockSignIn).toHaveBeenCalledWith('user@example.com', 'hunter2!');
  });

  it('renders the error message returned by signIn', async () => {
    mockSignIn.mockResolvedValueOnce({ error: new AuthError('Invalid login credentials') });
    render(<SignInScreen />);

    fireEvent.changeText(screen.getByLabelText('Email'), 'user@example.com');
    fireEvent.changeText(screen.getByLabelText('Password'), 'wrong');
    fireEvent.press(screen.getByLabelText('Sign in'));

    expect(await screen.findByText('Invalid login credentials')).toBeTruthy();
  });
});
