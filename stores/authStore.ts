import { AuthError, type Session, type User } from '@supabase/supabase-js';
import { create } from 'zustand';

import { supabase } from '@/lib/supabase';

type SignResult = { error: AuthError | null };

type AuthState = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  initialized: boolean;
  initialize: () => Promise<void>;
  signUp: (email: string, password: string) => Promise<SignResult>;
  signIn: (email: string, password: string) => Promise<SignResult>;
  signOut: () => Promise<SignResult>;
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

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
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
    } catch {
      set({ session: null, user: null });
    } finally {
      set({ initialized: true });
    }

    if (authSubscription) {
      return;
    }

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      set({
        session,
        user: session?.user ?? null,
      });
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
      return { error };
    } catch (err) {
      return { error: toAuthError(err) };
    } finally {
      set({ loading: false });
    }
  },
}));
