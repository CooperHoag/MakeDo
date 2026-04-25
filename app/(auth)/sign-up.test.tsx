import { AuthError } from '@supabase/supabase-js';
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import SignUpScreen from './sign-up';

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

describe('SignUpScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the sign up form', () => {
    render(<SignUpScreen />);

    expect(screen.getByLabelText('Email')).toBeTruthy();
    expect(screen.getByLabelText('Password')).toBeTruthy();
    expect(screen.getByLabelText('Sign up')).toBeTruthy();
  });

  it('calls signUp with the typed email and password', async () => {
    mockSignUp.mockResolvedValueOnce({ error: null });
    render(<SignUpScreen />);

    fireEvent.changeText(screen.getByLabelText('Email'), 'new@example.com');
    fireEvent.changeText(screen.getByLabelText('Password'), 'pw12345');
    fireEvent.press(screen.getByLabelText('Sign up'));

    await Promise.resolve();
    await Promise.resolve();

    expect(mockSignUp).toHaveBeenCalledWith('new@example.com', 'pw12345');
  });

  it('shows the "Check your email" message after a successful sign up', async () => {
    mockSignUp.mockResolvedValueOnce({ error: null });
    render(<SignUpScreen />);

    fireEvent.changeText(screen.getByLabelText('Email'), 'new@example.com');
    fireEvent.changeText(screen.getByLabelText('Password'), 'pw12345');
    fireEvent.press(screen.getByLabelText('Sign up'));

    expect(await screen.findByText('Check your email')).toBeTruthy();
    // form is replaced; no Sign up button anymore
    expect(screen.queryByLabelText('Sign up')).toBeNull();
  });

  it('renders the error message when signUp fails', async () => {
    mockSignUp.mockResolvedValueOnce({ error: new AuthError('Email already registered') });
    render(<SignUpScreen />);

    fireEvent.changeText(screen.getByLabelText('Email'), 'taken@example.com');
    fireEvent.changeText(screen.getByLabelText('Password'), 'pw12345');
    fireEvent.press(screen.getByLabelText('Sign up'));

    expect(await screen.findByText('Email already registered')).toBeTruthy();
  });
});
