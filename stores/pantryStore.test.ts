import { PostgrestError } from '@supabase/supabase-js';

import type { PantryItem } from '@/types/pantry';

type SelectResult = { data: unknown; error: PostgrestError | null };
type SingleResult = { data: unknown; error: PostgrestError | null };
type MutationResult = { data: unknown; error: PostgrestError | null };

const mockOrder: jest.Mock<Promise<SelectResult>, [string]> = jest.fn();
const mockSingle: jest.Mock<Promise<SingleResult>, []> = jest.fn();
const mockEq: jest.Mock = jest.fn();
const mockSelect: jest.Mock = jest.fn();
const mockInsert: jest.Mock = jest.fn();
const mockUpdate: jest.Mock = jest.fn();
const mockDelete: jest.Mock = jest.fn();
const mockFrom: jest.Mock = jest.fn();

// updateEqResult lets a single mock per .update().eq() call resolve to its own outcome.
const updateEqResults: MutationResult[] = [];
const deleteEqResults: MutationResult[] = [];

type ChainBuilder = {
  select: jest.Mock;
  insert: jest.Mock;
  update: jest.Mock;
  delete: jest.Mock;
  eq: jest.Mock;
  order: jest.Mock<Promise<SelectResult>, [string]>;
  single: jest.Mock<Promise<SingleResult>, []>;
};

const buildChain = (): ChainBuilder => ({
  select: mockSelect,
  insert: mockInsert,
  update: mockUpdate,
  delete: mockDelete,
  eq: mockEq,
  order: mockOrder,
  single: mockSingle,
});

const installDefaultChainImpls = () => {
  mockSelect.mockImplementation(() => buildChain());
  mockInsert.mockImplementation(() => buildChain());
  // .update(...).eq(...) → resolves the next queued result (or {error:null}).
  mockUpdate.mockImplementation(() => buildChain());
  mockDelete.mockImplementation(() => buildChain());
  mockEq.mockImplementation((): unknown => {
    // If the previous call in the chain was update or delete, the .eq() should resolve.
    // We can detect by inspecting which result queue is non-empty for the *next* operation.
    // Simpler: return a thenable that resolves on the first awaited consumer that wants a result.
    // To keep tests deterministic, return a promise that pulls from updateEqResults or deleteEqResults
    // depending on which one was set most recently. Tests that don't await an .eq() result still get
    // a chain builder via .single()/.order(), which override.
    return makeChainPromise();
  });
  mockOrder.mockImplementation(() => Promise.resolve({ data: [], error: null }));
  mockFrom.mockImplementation(() => buildChain());
};

// A promise-like object that also exposes chain methods so existing chain calls work.
const makeChainPromise = () => {
  const chain = buildChain();
  const result: MutationResult =
    updateEqResults.shift() ??
    deleteEqResults.shift() ?? { data: null, error: null };
  const p = Promise.resolve(result);
  return Object.assign(p, chain);
};

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => mockFrom(table),
  },
}));

type MockAuthState = { user: { id: string } | null };
let mockAuthState: MockAuthState = { user: { id: 'user-1' } };

jest.mock('@/stores/authStore', () => ({
  useAuthStore: {
    getState: (): MockAuthState => mockAuthState,
  },
}));

const fakeItem = (overrides: Partial<PantryItem> = {}): PantryItem => ({
  id: 'real-1',
  user_id: 'user-1',
  name: 'Salt',
  quantity: 1,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

const loadStore = (): typeof import('./pantryStore').usePantryStore => {
  let store: typeof import('./pantryStore').usePantryStore | undefined;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('./pantryStore') as typeof import('./pantryStore');
    store = mod.usePantryStore;
  });
  if (!store) {
    throw new Error('Failed to load pantryStore module');
  }
  return store;
};

const pgError = (message: string): PostgrestError =>
  ({
    message,
    details: '',
    hint: '',
    code: 'X',
    name: 'PostgrestError',
  }) as unknown as PostgrestError;

describe('pantryStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    updateEqResults.length = 0;
    deleteEqResults.length = 0;
    mockAuthState = { user: { id: 'user-1' } };
    installDefaultChainImpls();
  });

  describe('loadItems', () => {
    it('populates items sorted alphabetically and sets loaded true on success', async () => {
      const unsorted: PantryItem[] = [
        fakeItem({ id: '1', name: 'Onions' }),
        fakeItem({ id: '2', name: 'apples' }),
        fakeItem({ id: '3', name: 'Black pepper' }),
      ];
      mockOrder.mockResolvedValueOnce({ data: unsorted, error: null });

      const useStore = loadStore();
      await useStore.getState().loadItems();

      const state = useStore.getState();
      expect(state.loaded).toBe(true);
      expect(state.error).toBeNull();
      expect(state.items.map((i) => i.name)).toEqual([
        'apples',
        'Black pepper',
        'Onions',
      ]);
    });

    it('sets loaded true and error when supabase returns an error', async () => {
      mockOrder.mockResolvedValueOnce({ data: null, error: pgError('forbidden') });

      const useStore = loadStore();
      await useStore.getState().loadItems();

      const state = useStore.getState();
      expect(state.loaded).toBe(true);
      expect(state.error).toBe('forbidden');
      expect(state.items).toEqual([]);
    });

    it('sets loaded true and error when supabase throws', async () => {
      mockOrder.mockRejectedValueOnce(new Error('network down'));

      const useStore = loadStore();
      await useStore.getState().loadItems();

      const state = useStore.getState();
      expect(state.loaded).toBe(true);
      expect(state.error).toBe('network down');
    });
  });

  describe('addItem', () => {
    it('inserts optimistically before the supabase promise resolves, then swaps in real row', async () => {
      let resolveSingle: (value: SingleResult) => void = () => {};
      const deferred = new Promise<SingleResult>((res) => {
        resolveSingle = res;
      });
      mockSingle.mockReturnValueOnce(deferred);

      const useStore = loadStore();
      const addPromise = useStore.getState().addItem('Onions');

      // Sync check: optimistic item should be in state immediately.
      const optimistic = useStore.getState().items;
      expect(optimistic).toHaveLength(1);
      expect(optimistic[0]?.name).toBe('Onions');
      expect(optimistic[0]?.id.startsWith('temp-')).toBe(true);
      expect(optimistic[0]?.quantity).toBe(1);

      // Resolve the supabase insert.
      resolveSingle({
        data: fakeItem({ id: 'real-1', name: 'Onions', quantity: 1 }),
        error: null,
      });
      await addPromise;

      const after = useStore.getState();
      expect(after.items).toHaveLength(1);
      expect(after.items[0]?.id).toBe('real-1');
      expect(after.error).toBeNull();
      expect(mockFrom).toHaveBeenCalledWith('pantry_items');
      expect(mockInsert).toHaveBeenCalledWith({ name: 'Onions', user_id: 'user-1' });
    });

    it('rolls back the optimistic item and surfaces error on failure', async () => {
      mockSingle.mockResolvedValueOnce({ data: null, error: pgError('insert failed') });

      const useStore = loadStore();
      await useStore.getState().addItem('Onions');

      const state = useStore.getState();
      expect(state.items).toEqual([]);
      expect(state.error).toBe('insert failed');
    });

    it('rejects empty / whitespace-only names without calling supabase', async () => {
      const useStore = loadStore();
      await useStore.getState().addItem('   ');

      expect(mockInsert).not.toHaveBeenCalled();
      expect(useStore.getState().error).toBe('Item name cannot be empty.');
    });

    it('trims the name before sending to supabase', async () => {
      mockSingle.mockResolvedValueOnce({
        data: fakeItem({ id: 'real-1', name: 'Onions' }),
        error: null,
      });

      const useStore = loadStore();
      await useStore.getState().addItem('  Onions  ');

      expect(mockInsert).toHaveBeenCalledWith({ name: 'Onions', user_id: 'user-1' });
    });

    it('returns early with error when no user is signed in (no supabase call, no optimistic item)', async () => {
      mockAuthState = { user: null };

      const useStore = loadStore();
      await useStore.getState().addItem('Onions');

      const state = useStore.getState();
      expect(state.items).toEqual([]);
      expect(state.error).toBe('Not signed in');
      expect(mockInsert).not.toHaveBeenCalled();
      expect(mockFrom).not.toHaveBeenCalled();
    });
  });

  describe('updateName', () => {
    const seed = (
      useStore: ReturnType<typeof loadStore>,
      items: PantryItem[],
    ) => {
      useStore.setState({ items, loaded: true });
    };

    it('updates optimistically and re-sorts on rename success', async () => {
      const apples = fakeItem({ id: 'a', name: 'Apples' });
      const onions = fakeItem({ id: 'o', name: 'Onions' });
      const useStore = loadStore();
      seed(useStore, [apples, onions]);

      updateEqResults.push({ data: null, error: null });

      await useStore.getState().updateName('a', 'Zucchini');

      const state = useStore.getState();
      expect(state.items.map((i) => i.name)).toEqual(['Onions', 'Zucchini']);
      expect(state.error).toBeNull();
      expect(mockUpdate).toHaveBeenCalledWith({ name: 'Zucchini' });
      expect(mockEq).toHaveBeenCalledWith('id', 'a');
    });

    it('rolls back to the previous name and surfaces error on failure', async () => {
      const apples = fakeItem({ id: 'a', name: 'Apples' });
      const useStore = loadStore();
      seed(useStore, [apples]);

      updateEqResults.push({ data: null, error: pgError('update failed') });

      await useStore.getState().updateName('a', 'Zucchini');

      const state = useStore.getState();
      expect(state.items[0]?.name).toBe('Apples');
      expect(state.error).toBe('update failed');
    });

    it('rejects empty trimmed names without calling supabase', async () => {
      const apples = fakeItem({ id: 'a', name: 'Apples' });
      const useStore = loadStore();
      seed(useStore, [apples]);

      await useStore.getState().updateName('a', '   ');

      expect(mockUpdate).not.toHaveBeenCalled();
      expect(useStore.getState().error).toBe('Item name cannot be empty.');
    });

    it('does nothing when the name is unchanged', async () => {
      const apples = fakeItem({ id: 'a', name: 'Apples' });
      const useStore = loadStore();
      seed(useStore, [apples]);

      await useStore.getState().updateName('a', 'Apples');

      expect(mockUpdate).not.toHaveBeenCalled();
    });
  });

  describe('incrementQuantity', () => {
    it('increments optimistically and writes to supabase', async () => {
      const onions = fakeItem({ id: 'o', name: 'Onions', quantity: 2 });
      const useStore = loadStore();
      useStore.setState({ items: [onions], loaded: true });
      updateEqResults.push({ data: null, error: null });

      await useStore.getState().incrementQuantity('o');

      expect(useStore.getState().items[0]?.quantity).toBe(3);
      expect(mockUpdate).toHaveBeenCalledWith({ quantity: 3 });
      expect(useStore.getState().error).toBeNull();
    });

    it('rolls back on failure and surfaces the error', async () => {
      const onions = fakeItem({ id: 'o', name: 'Onions', quantity: 2 });
      const useStore = loadStore();
      useStore.setState({ items: [onions], loaded: true });
      updateEqResults.push({ data: null, error: pgError('update failed') });

      await useStore.getState().incrementQuantity('o');

      expect(useStore.getState().items[0]?.quantity).toBe(2);
      expect(useStore.getState().error).toBe('update failed');
    });
  });

  describe('decrementQuantity', () => {
    it('decrements optimistically and writes to supabase', async () => {
      const onions = fakeItem({ id: 'o', name: 'Onions', quantity: 2 });
      const useStore = loadStore();
      useStore.setState({ items: [onions], loaded: true });
      updateEqResults.push({ data: null, error: null });

      await useStore.getState().decrementQuantity('o');

      expect(useStore.getState().items[0]?.quantity).toBe(1);
      expect(mockUpdate).toHaveBeenCalledWith({ quantity: 1 });
    });

    it('is a no-op when current quantity is 0 (no supabase call)', async () => {
      const onions = fakeItem({ id: 'o', name: 'Onions', quantity: 0 });
      const useStore = loadStore();
      useStore.setState({ items: [onions], loaded: true });

      await useStore.getState().decrementQuantity('o');

      expect(useStore.getState().items[0]?.quantity).toBe(0);
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('rolls back on failure and surfaces the error', async () => {
      const onions = fakeItem({ id: 'o', name: 'Onions', quantity: 2 });
      const useStore = loadStore();
      useStore.setState({ items: [onions], loaded: true });
      updateEqResults.push({ data: null, error: pgError('update failed') });

      await useStore.getState().decrementQuantity('o');

      expect(useStore.getState().items[0]?.quantity).toBe(2);
      expect(useStore.getState().error).toBe('update failed');
    });
  });

  describe('deleteItem', () => {
    it('removes the item optimistically on success', async () => {
      const apples = fakeItem({ id: 'a', name: 'Apples' });
      const onions = fakeItem({ id: 'o', name: 'Onions' });
      const useStore = loadStore();
      useStore.setState({ items: [apples, onions], loaded: true });
      deleteEqResults.push({ data: null, error: null });

      await useStore.getState().deleteItem('a');

      expect(useStore.getState().items.map((i) => i.id)).toEqual(['o']);
      expect(mockDelete).toHaveBeenCalled();
      expect(mockEq).toHaveBeenCalledWith('id', 'a');
    });

    it('restores the item in alphabetical position on failure', async () => {
      const apples = fakeItem({ id: 'a', name: 'Apples' });
      const onions = fakeItem({ id: 'o', name: 'Onions' });
      const salt = fakeItem({ id: 's', name: 'Salt' });
      const useStore = loadStore();
      useStore.setState({ items: [apples, onions, salt], loaded: true });
      deleteEqResults.push({ data: null, error: pgError('delete failed') });

      await useStore.getState().deleteItem('o');

      const names = useStore.getState().items.map((i) => i.name);
      expect(names).toEqual(['Apples', 'Onions', 'Salt']);
      expect(useStore.getState().error).toBe('delete failed');
    });
  });
});
