import {
  AuthError,
  PostgrestError,
  type Session,
  type User,
} from '@supabase/supabase-js';

type GetSessionResult = {
  data: { session: Session | null };
  error: AuthError | null;
};

type SignResult = { data: unknown; error: AuthError | null };
type SingleResult = { data: unknown; error: PostgrestError | null };

type AuthMethodMock = jest.Mock<Promise<SignResult>, [unknown]>;
type SignOutMock = jest.Mock<Promise<{ error: AuthError | null }>, []>;
type GetSessionMock = jest.Mock<Promise<GetSessionResult>, []>;
type OnAuthStateChangeMock = jest.Mock<
  { data: { subscription: { unsubscribe: () => void } } },
  [(event: string, session: Session | null) => void]
>;

const mockGetSession: GetSessionMock = jest.fn();
const mockSignUp: AuthMethodMock = jest.fn();
const mockSignInWithPassword: AuthMethodMock = jest.fn();
const mockSignOut: SignOutMock = jest.fn();
const mockOnAuthStateChange: OnAuthStateChangeMock = jest.fn();
mockOnAuthStateChange.mockImplementation(() => ({
  data: { subscription: { unsubscribe: jest.fn() } },
}));

// Postgrest chain mocks. Each verb returns the same builder so any chain order works.
const mockSingle: jest.Mock<Promise<SingleResult>, []> = jest.fn();
const mockSelect: jest.Mock = jest.fn();
const mockEq: jest.Mock = jest.fn();
const mockUpdate: jest.Mock = jest.fn();
const mockFrom: jest.Mock = jest.fn();

type ChainBuilder = {
  select: jest.Mock;
  update: jest.Mock;
  eq: jest.Mock;
  single: jest.Mock<Promise<SingleResult>, []>;
};

const buildChain = (): ChainBuilder => ({
  select: mockSelect,
  update: mockUpdate,
  eq: mockEq,
  single: mockSingle,
});

mockSelect.mockImplementation(() => buildChain());
mockEq.mockImplementation(() => buildChain());
mockUpdate.mockImplementation(() => buildChain());
mockFrom.mockImplementation(() => buildChain());

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => mockGetSession(...(args as [])),
      signUp: (args: unknown) => mockSignUp(args),
      signInWithPassword: (args: unknown) => mockSignInWithPassword(args),
      signOut: (...args: unknown[]) => mockSignOut(...(args as [])),
      onAuthStateChange: (cb: (event: string, session: Session | null) => void) =>
        mockOnAuthStateChange(cb),
    },
    from: (table: string) => mockFrom(table),
  },
}));

const fakeUser = { id: 'user-1', email: 'test@example.com' } as unknown as User;
const fakeSession = {
  access_token: 'token',
  refresh_token: 'refresh',
  expires_in: 3600,
  token_type: 'bearer',
  user: fakeUser,
} as unknown as Session;

const fakeProfile = {
  id: 'user-1',
  created_at: '2026-01-01T00:00:00Z',
  onboarding_complete: false,
};

const loadStore = (): typeof import('./authStore').useAuthStore => {
  let store: typeof import('./authStore').useAuthStore | undefined;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('./authStore') as typeof import('./authStore');
    store = mod.useAuthStore;
  });
  if (!store) {
    throw new Error('Failed to load authStore module');
  }
  return store;
};

describe('authStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOnAuthStateChange.mockImplementation(() => ({
      data: { subscription: { unsubscribe: jest.fn() } },
    }));
    mockSelect.mockImplementation(() => buildChain());
    mockEq.mockImplementation(() => buildChain());
    mockUpdate.mockImplementation(() => buildChain());
    mockFrom.mockImplementation(() => buildChain());
  });

  describe('initialize', () => {
    it('populates session and user and sets initialized when getSession succeeds', async () => {
      mockGetSession.mockResolvedValueOnce({
        data: { session: fakeSession },
        error: null,
      });
      mockSingle.mockResolvedValueOnce({ data: fakeProfile, error: null });

      const useAuthStore = loadStore();
      await useAuthStore.getState().initialize();

      const state = useAuthStore.getState();
      expect(state.session).toEqual(fakeSession);
      expect(state.user).toEqual(fakeUser);
      expect(state.initialized).toBe(true);
      expect(mockOnAuthStateChange).toHaveBeenCalledTimes(1);
    });

    it('sets initialized to true even when getSession throws', async () => {
      mockGetSession.mockRejectedValueOnce(new Error('network down'));

      const useAuthStore = loadStore();
      await useAuthStore.getState().initialize();

      const state = useAuthStore.getState();
      expect(state.initialized).toBe(true);
      expect(state.session).toBeNull();
      expect(state.user).toBeNull();
      expect(state.profileLoaded).toBe(true);
    });

    it('loads the profile when a session exists, marking profileLoaded true', async () => {
      mockGetSession.mockResolvedValueOnce({
        data: { session: fakeSession },
        error: null,
      });
      mockSingle.mockResolvedValueOnce({ data: fakeProfile, error: null });

      const useAuthStore = loadStore();
      await useAuthStore.getState().initialize();

      const state = useAuthStore.getState();
      expect(state.profile).toEqual(fakeProfile);
      expect(state.profileLoaded).toBe(true);
      expect(mockFrom).toHaveBeenCalledWith('profiles');
    });

    it('sets profileLoaded true with no session so the gate does not hang', async () => {
      mockGetSession.mockResolvedValueOnce({
        data: { session: null },
        error: null,
      });

      const useAuthStore = loadStore();
      await useAuthStore.getState().initialize();

      expect(useAuthStore.getState().profileLoaded).toBe(true);
    });

    it('marks profileLoaded true and leaves profile null when loadProfile returns an error', async () => {
      mockGetSession.mockResolvedValueOnce({
        data: { session: fakeSession },
        error: null,
      });
      const pgError = {
        message: 'permission denied',
        details: '',
        hint: '',
        code: '42501',
        name: 'PostgrestError',
      } as unknown as PostgrestError;
      mockSingle.mockResolvedValueOnce({ data: null, error: pgError });

      const useAuthStore = loadStore();
      await useAuthStore.getState().initialize();

      const state = useAuthStore.getState();
      expect(state.profile).toBeNull();
      expect(state.profileLoaded).toBe(true);
      expect(state.initialized).toBe(true);
    });
  });

  describe('signUp', () => {
    it('calls supabase.auth.signUp with email and password and returns { error: null } on success', async () => {
      mockSignUp.mockResolvedValueOnce({ data: { user: fakeUser }, error: null });

      const useAuthStore = loadStore();
      const result = await useAuthStore
        .getState()
        .signUp('test@example.com', 'pw12345');

      expect(mockSignUp).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'pw12345',
      });
      expect(result.error).toBeNull();
    });

    it('returns the AuthError when Supabase rejects the sign up', async () => {
      const authError = new AuthError('Email already registered');
      mockSignUp.mockResolvedValueOnce({ data: null, error: authError });

      const useAuthStore = loadStore();
      const result = await useAuthStore.getState().signUp('a@b.co', 'pw');

      expect(result.error).toBe(authError);
    });
  });

  describe('signIn', () => {
    it('calls supabase.auth.signInWithPassword with email and password and returns { error: null } on success', async () => {
      mockSignInWithPassword.mockResolvedValueOnce({
        data: { user: fakeUser, session: fakeSession },
        error: null,
      });

      const useAuthStore = loadStore();
      const result = await useAuthStore
        .getState()
        .signIn('test@example.com', 'pw12345');

      expect(mockSignInWithPassword).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'pw12345',
      });
      expect(result.error).toBeNull();
    });

    it('returns the AuthError when credentials are wrong', async () => {
      const authError = new AuthError('Invalid login credentials');
      mockSignInWithPassword.mockResolvedValueOnce({ data: null, error: authError });

      const useAuthStore = loadStore();
      const result = await useAuthStore.getState().signIn('a@b.co', 'pw');

      expect(result.error).toBe(authError);
    });
  });

  describe('signOut', () => {
    it('calls supabase.auth.signOut and returns { error: null } on success', async () => {
      mockSignOut.mockResolvedValueOnce({ error: null });

      const useAuthStore = loadStore();
      const result = await useAuthStore.getState().signOut();

      expect(mockSignOut).toHaveBeenCalledTimes(1);
      expect(result.error).toBeNull();
    });

    it('returns the AuthError when sign out fails', async () => {
      const authError = new AuthError('Sign out failed');
      mockSignOut.mockResolvedValueOnce({ error: authError });

      const useAuthStore = loadStore();
      const result = await useAuthStore.getState().signOut();

      expect(result.error).toBe(authError);
    });
  });

  describe('completeOnboarding', () => {
    it('updates profiles row with onboarding_complete true and returns { error: null } on success', async () => {
      // First load the user via initialize so completeOnboarding has a userId.
      mockGetSession.mockResolvedValueOnce({
        data: { session: fakeSession },
        error: null,
      });
      mockSingle.mockResolvedValueOnce({ data: fakeProfile, error: null });

      const useAuthStore = loadStore();
      await useAuthStore.getState().initialize();

      const completedProfile = { ...fakeProfile, onboarding_complete: true };
      mockSingle.mockResolvedValueOnce({ data: completedProfile, error: null });

      const result = await useAuthStore.getState().completeOnboarding();

      expect(mockFrom).toHaveBeenCalledWith('profiles');
      expect(mockUpdate).toHaveBeenCalledWith({ onboarding_complete: true });
      expect(mockEq).toHaveBeenCalledWith('id', 'user-1');
      expect(mockSelect).toHaveBeenCalled();
      expect(result.error).toBeNull();
      expect(useAuthStore.getState().profile?.onboarding_complete).toBe(true);
    });

    it('returns the error when the update rejects', async () => {
      mockGetSession.mockResolvedValueOnce({
        data: { session: fakeSession },
        error: null,
      });
      mockSingle.mockResolvedValueOnce({ data: fakeProfile, error: null });

      const useAuthStore = loadStore();
      await useAuthStore.getState().initialize();

      const pgError = {
        message: 'permission denied',
        details: '',
        hint: '',
        code: '42501',
        name: 'PostgrestError',
      } as unknown as PostgrestError;
      mockSingle.mockResolvedValueOnce({ data: null, error: pgError });

      const result = await useAuthStore.getState().completeOnboarding();

      expect(result.error).toBe(pgError);
    });

    it('returns an AuthError when no user is signed in', async () => {
      mockGetSession.mockResolvedValueOnce({
        data: { session: null },
        error: null,
      });

      const useAuthStore = loadStore();
      await useAuthStore.getState().initialize();

      const result = await useAuthStore.getState().completeOnboarding();

      expect(result.error?.message).toBe('Not signed in');
      expect(result.error?.name).toBe('AuthError');
    });
  });
});
