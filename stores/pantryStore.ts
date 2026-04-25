import { PostgrestError } from '@supabase/supabase-js';
import { create } from 'zustand';

import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import type { PantryItem } from '@/types/pantry';

type PantryState = {
  items: PantryItem[];
  loading: boolean;
  loaded: boolean;
  error: string | null;
  loadItems: () => Promise<void>;
  addItem: (name: string) => Promise<void>;
  updateName: (id: string, name: string) => Promise<void>;
  incrementQuantity: (id: string) => Promise<void>;
  decrementQuantity: (id: string) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
};

const sortByName = (items: PantryItem[]): PantryItem[] =>
  [...items].sort((a, b) =>
    a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
  );

const errorMessage = (err: unknown, fallback = 'Something went wrong'): string => {
  if (err && typeof err === 'object' && 'message' in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === 'string' && message.length > 0) {
      return message;
    }
  }
  if (err instanceof Error && err.message) {
    return err.message;
  }
  return fallback;
};

let tempIdCounter = 0;
const nextTempId = (): string => {
  tempIdCounter += 1;
  return `temp-${Date.now()}-${tempIdCounter}`;
};

export const usePantryStore = create<PantryState>((set, get) => ({
  items: [],
  loading: false,
  loaded: false,
  error: null,

  loadItems: async () => {
    set({ loading: true, error: null });
    try {
      const { data, error } = await supabase
        .from('pantry_items')
        .select('*')
        .order('name');
      if (error) {
        set({
          loading: false,
          loaded: true,
          error: errorMessage(error as PostgrestError, 'Could not load pantry'),
        });
        return;
      }
      const items = sortByName((data ?? []) as PantryItem[]);
      set({ items, loading: false, loaded: true });
    } catch (err) {
      set({
        loading: false,
        loaded: true,
        error: errorMessage(err, 'Could not load pantry'),
      });
    }
  },

  addItem: async (rawName) => {
    set({ error: null });
    const name = rawName.trim();
    if (!name) {
      set({ error: 'Item name cannot be empty.' });
      return;
    }

    const userId = useAuthStore.getState().user?.id;
    if (!userId) {
      set({ error: 'Not signed in' });
      return;
    }

    const tempId = nextTempId();
    const now = new Date().toISOString();
    const tempItem: PantryItem = {
      id: tempId,
      user_id: userId,
      name,
      quantity: 1,
      created_at: now,
      updated_at: now,
    };

    set({ items: sortByName([...get().items, tempItem]) });

    try {
      const { data, error } = await supabase
        .from('pantry_items')
        .insert({ name, user_id: userId })
        .select()
        .single();
      if (error || !data) {
        set({
          items: get().items.filter((i) => i.id !== tempId),
          error: errorMessage(error, 'Could not add item'),
        });
        return;
      }
      const realItem = data as PantryItem;
      set({
        items: sortByName(
          get().items.map((i) => (i.id === tempId ? realItem : i)),
        ),
      });
    } catch (err) {
      set({
        items: get().items.filter((i) => i.id !== tempId),
        error: errorMessage(err, 'Could not add item'),
      });
    }
  },

  updateName: async (id, rawName) => {
    set({ error: null });
    const name = rawName.trim();
    if (!name) {
      set({ error: 'Item name cannot be empty.' });
      return;
    }

    const previous = get().items.find((i) => i.id === id);
    if (!previous) {
      return;
    }
    if (previous.name === name) {
      return;
    }

    set({
      items: sortByName(
        get().items.map((i) => (i.id === id ? { ...i, name } : i)),
      ),
    });

    try {
      const { error } = await supabase
        .from('pantry_items')
        .update({ name })
        .eq('id', id);
      if (error) {
        set({
          items: sortByName(
            get().items.map((i) =>
              i.id === id ? { ...i, name: previous.name } : i,
            ),
          ),
          error: errorMessage(error, 'Could not rename item'),
        });
      }
    } catch (err) {
      set({
        items: sortByName(
          get().items.map((i) =>
            i.id === id ? { ...i, name: previous.name } : i,
          ),
        ),
        error: errorMessage(err, 'Could not rename item'),
      });
    }
  },

  incrementQuantity: async (id) => {
    set({ error: null });
    const previous = get().items.find((i) => i.id === id);
    if (!previous) {
      return;
    }
    const newQty = previous.quantity + 1;

    set({
      items: get().items.map((i) =>
        i.id === id ? { ...i, quantity: newQty } : i,
      ),
    });

    try {
      const { error } = await supabase
        .from('pantry_items')
        .update({ quantity: newQty })
        .eq('id', id);
      if (error) {
        set({
          items: get().items.map((i) =>
            i.id === id ? { ...i, quantity: previous.quantity } : i,
          ),
          error: errorMessage(error, 'Could not update quantity'),
        });
      }
    } catch (err) {
      set({
        items: get().items.map((i) =>
          i.id === id ? { ...i, quantity: previous.quantity } : i,
        ),
        error: errorMessage(err, 'Could not update quantity'),
      });
    }
  },

  decrementQuantity: async (id) => {
    set({ error: null });
    const previous = get().items.find((i) => i.id === id);
    if (!previous) {
      return;
    }
    if (previous.quantity <= 0) {
      return;
    }
    const newQty = previous.quantity - 1;

    set({
      items: get().items.map((i) =>
        i.id === id ? { ...i, quantity: newQty } : i,
      ),
    });

    try {
      const { error } = await supabase
        .from('pantry_items')
        .update({ quantity: newQty })
        .eq('id', id);
      if (error) {
        set({
          items: get().items.map((i) =>
            i.id === id ? { ...i, quantity: previous.quantity } : i,
          ),
          error: errorMessage(error, 'Could not update quantity'),
        });
      }
    } catch (err) {
      set({
        items: get().items.map((i) =>
          i.id === id ? { ...i, quantity: previous.quantity } : i,
        ),
        error: errorMessage(err, 'Could not update quantity'),
      });
    }
  },

  deleteItem: async (id) => {
    set({ error: null });
    const previous = get().items.find((i) => i.id === id);
    if (!previous) {
      return;
    }

    set({ items: get().items.filter((i) => i.id !== id) });

    try {
      const { error } = await supabase.from('pantry_items').delete().eq('id', id);
      if (error) {
        set({
          items: sortByName([...get().items, previous]),
          error: errorMessage(error, 'Could not delete item'),
        });
      }
    } catch (err) {
      set({
        items: sortByName([...get().items, previous]),
        error: errorMessage(err, 'Could not delete item'),
      });
    }
  },
}));
