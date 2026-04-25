import { AuthError, PostgrestError } from '@supabase/supabase-js';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import OnboardingScreen from './onboarding';

type CompleteOnboardingResult = { error: AuthError | PostgrestError | null };
type AuthState = {
  completeOnboarding: () => Promise<CompleteOnboardingResult>;
};

const completeOnboarding = jest.fn<Promise<CompleteOnboardingResult>, []>();
let mockState: AuthState = { completeOnboarding };

jest.mock('@/stores/authStore', () => ({
  useAuthStore: Object.assign(
    <T,>(selector: (state: AuthState) => T): T => selector(mockState),
    {
      getState: (): AuthState => mockState,
    },
  ),
}));

describe('OnboardingScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockState = { completeOnboarding };
  });

  it('renders the heading "Welcome to MakeDo"', () => {
    render(<OnboardingScreen />);
    expect(screen.getByText('Welcome to MakeDo')).toBeTruthy();
  });

  it('renders the body copy', () => {
    render(<OnboardingScreen />);
    expect(
      screen.getByText(/quietly opting out of the noise/),
    ).toBeTruthy();
  });

  it('renders the Get started button', () => {
    render(<OnboardingScreen />);
    expect(screen.getByLabelText('Get started')).toBeTruthy();
  });

  it('calls completeOnboarding when the button is tapped', async () => {
    completeOnboarding.mockResolvedValueOnce({ error: null });
    render(<OnboardingScreen />);

    const button = screen.getByLabelText('Get started');
    await act(async () => {
      fireEvent.press(button);
    });

    expect(completeOnboarding).toHaveBeenCalledTimes(1);
  });

  it('renders an error message when completeOnboarding returns an error', async () => {
    completeOnboarding.mockResolvedValueOnce({
      error: new AuthError('Not signed in'),
    });
    render(<OnboardingScreen />);

    const button = screen.getByLabelText('Get started');
    await act(async () => {
      fireEvent.press(button);
    });

    expect(screen.getByText('Not signed in')).toBeTruthy();
  });
});
