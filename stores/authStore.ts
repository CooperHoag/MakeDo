import {
  AuthError,
  PostgrestError,
  type Session,
  type User,
} from '@supabase/supabase-js';
import { create } from 'zustand';

import { supabase } from '@/lib/supabase';
import { usePantryStore } from '@/stores/pantryStore';
import { useRecipeStore } from '@/stores/recipeStore';
import type { Profile } from '@/types/profile';

const clearUserScopedState = (): void => {
  useRecipeStore.getState().clearRecipes();
  usePantryStore.getState().clear();
};

type SignResult = { error: AuthError | null };
type CompleteOnboardingResult = { error: AuthError | PostgrestError | null };

type AuthState = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  profileLoaded: boolean;
  loading: boolean;
  initialized: boolean;
  initialize: () => Promise<void>;
  signUp: (email: string, password: string) => Promise<SignResult>;
  signIn: (email: string, password: string) => Promise<SignResult>;
  signOut: () => Promise<SignResult>;
  completeOnboarding: () => Promise<CompleteOnboardingResult>;
};

const toAuthError = (err: unknown): AuthError => {
  if (err instanceof AuthError) {
    return err;
  }
  const message = err instanceof Error ? err.message : 'Unexpected authentication error';
  // AuthError's constructor accepts (message, status?, code?). Use it directly to
  // produce a real AuthError instance rather than a synthetic shape.
  return new AuthError(message);
};

let authSubscription: { unsubscribe: () => void } | null = null;

const loadProfileFor = async (
  userId: string,
  set: (partial: Partial<AuthState>) => void,
): Promise<void> => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (error) {
      set({ profileLoaded: true });
      return;
    }
    set({ profile: data as Profile, profileLoaded: true });
  } catch {
    set({ profileLoaded: true });
  }
};

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  profile: null,
  profileLoaded: false,
  loading: false,
  initialized: false,

  initialize: async () => {
    if (get().initialized) {
      return;
    }

    try {
      const { data } = await supabase.auth.getSession();
      set({
        session: data.session,
        user: data.session?.user ?? null,
      });
      if (data.session?.user) {
        await loadProfileFor(data.session.user.id, set);
      } else {
        set({ profileLoaded: true });
      }
    } catch {
      set({ session: null, user: null, profileLoaded: true });
    } finally {
      set({ initialized: true });
    }

    if (authSubscription) {
      return;
    }

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      set({
        session,
        user: session?.user ?? null,
      });
      if (event === 'SIGNED_OUT') {
        set({ profile: null, profileLoaded: true });
        clearUserScopedState();
        return;
      }
      if (
        (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') &&
        session?.user
      ) {
        void loadProfileFor(session.user.id, set);
      }
    });

    authSubscription = listener.subscription;
  },

  signUp: async (email, password) => {
    set({ loading: true });
    try {
      const { error } = await supabase.auth.signUp({ email, password });
      return { error };
    } catch (err) {
      return { error: toAuthError(err) };
    } finally {
      set({ loading: false });
    }
  },

  signIn: async (email, password) => {
    set({ loading: true });
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error };
    } catch (err) {
      return { error: toAuthError(err) };
    } finally {
      set({ loading: false });
    }
  },

  signOut: async () => {
    set({ loading: true });
    try {
      const { error } = await supabase.auth.signOut();
      if (!error) {
        clearUserScopedState();
      }
      return { error };
    } catch (err) {
      return { error: toAuthError(err) };
    } finally {
      set({ loading: false });
    }
  },

  completeOnboarding: async () => {
    const userId = get().user?.id;
    if (!userId) {
      return { error: new AuthError('Not signed in') };
    }
    set({ loading: true });
    try {
      const { data, error } = await supabase
        .from('profiles')
        .update({ onboarding_complete: true })
        .eq('id', userId)
        .select()
        .single();
      if (error) {
        return { error: error as PostgrestError };
      }
      set({ profile: data as Profile });
      return { error: null };
    } catch (err) {
      return { error: toAuthError(err) };
    } finally {
      set({ loading: false });
    }
  },
}));
