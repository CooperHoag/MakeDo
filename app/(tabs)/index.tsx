import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  type ListRenderItem,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';

import { useAuthStore } from '@/stores/authStore';
import { usePantryStore } from '@/stores/pantryStore';
import { useRecipeStore } from '@/stores/recipeStore';
import type { PantryItem } from '@/types/pantry';

export default function HomeScreen() {
  const items = usePantryStore((state) => state.items);
  const loaded = usePantryStore((state) => state.loaded);
  const error = usePantryStore((state) => state.error);
  const recipeLoading = useRecipeStore((state) => state.loading);
  const router = useRouter();

  const [draftName, setDraftName] = useState('');
  const [signOutLoading, setSignOutLoading] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void usePantryStore.getState().loadItems();
    }, []),
  );

  const handleAdd = async () => {
    const trimmed = draftName.trim();
    if (!trimmed) {
      return;
    }
    setDraftName('');
    // TODO: Phase 2 task #3 — caller must pass the real unit picked in the
    // redesigned add-item screen. The placeholder 'count' keeps the legacy
    // single-input flow functional until then.
    await usePantryStore.getState().addItem(trimmed, 'count');
  };

  const handleSignOut = async () => {
    setSignOutError(null);
    setSignOutLoading(true);
    const { error: err } = await useAuthStore.getState().signOut();
    if (err) {
      setSignOutError(err.message);
    }
    setSignOutLoading(false);
  };

  const renderItem: ListRenderItem<PantryItem> = ({ item }) => (
    <PantryRow item={item} />
  );

  const addDisabled = draftName.trim().length === 0;
  const pantryEmpty = loaded && items.length === 0;
  const suggestDisabled = pantryEmpty || recipeLoading;

  const handleSuggestRecipes = async () => {
    if (suggestDisabled) {
      return;
    }
    await useRecipeStore.getState().fetchRecipes();
    router.push('/recipes');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        <Text style={styles.wordmark}>MakeDo</Text>
        <Pressable
          onPress={handleSignOut}
          disabled={signOutLoading}
          accessibilityLabel="Sign out"
          accessibilityRole="button"
          hitSlop={8}
        >
          <Text style={styles.signOutText}>
            {signOutLoading ? 'Signing out…' : 'Sign out'}
          </Text>
        </Pressable>
      </View>

      <View style={styles.headerBlock}>
        <Text style={styles.heading}>Pantry</Text>
        <Text style={styles.subhead}>Add what you have. Edit any time.</Text>
      </View>

      <View style={styles.suggestRow}>
        <Pressable
          onPress={handleSuggestRecipes}
          disabled={suggestDisabled}
          accessibilityLabel="What can I make?"
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.suggestButton,
            suggestDisabled && styles.suggestButtonDisabled,
            pressed && !suggestDisabled && styles.suggestButtonPressed,
          ]}
        >
          {recipeLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.suggestButtonText}>What can I make?</Text>
          )}
        </Pressable>
      </View>

      <View style={styles.addRow}>
        <TextInput
          style={styles.addInput}
          value={draftName}
          onChangeText={setDraftName}
          placeholder="Add an item…"
          placeholderTextColor="#999"
          returnKeyType="done"
          onSubmitEditing={handleAdd}
          autoCorrect={false}
          accessibilityLabel="Add a pantry item"
        />
        <Pressable
          onPress={handleAdd}
          disabled={addDisabled}
          accessibilityLabel="Add item"
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.addButton,
            addDisabled && styles.addButtonDisabled,
            pressed && !addDisabled && styles.addButtonPressed,
          ]}
        >
          <Text style={styles.addButtonText}>+</Text>
        </Pressable>
      </View>

      {error || signOutError ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{error ?? signOutError}</Text>
        </View>
      ) : null}

      {!loaded ? (
        <View style={styles.centered} accessibilityLabel="Loading pantry">
          <ActivityIndicator />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>Your pantry is empty.</Text>
          <Text style={styles.emptyBody}>
            Add what's in your kitchen — even if it's just a few things. MakeDo
            works with whatever you've got.
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          ItemSeparatorComponent={Separator}
          contentContainerStyle={styles.listContent}
        />
      )}
    </SafeAreaView>
  );
}

const Separator = () => <View style={styles.separator} />;

type PantryRowProps = {
  item: PantryItem;
};

const PantryRow = ({ item }: PantryRowProps) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.name);

  const startEdit = () => {
    setDraft(item.name);
    setEditing(true);
  };

  const finishEdit = async () => {
    setEditing(false);
    const trimmed = draft.trim();
    if (!trimmed || trimmed === item.name) {
      setDraft(item.name);
      return;
    }
    await usePantryStore.getState().updateName(item.id, trimmed);
  };

  const handleIncrement = () => {
    void usePantryStore.getState().incrementQuantity(item.id);
  };

  const handleDecrement = () => {
    void usePantryStore.getState().decrementQuantity(item.id);
  };

  const handleDelete = () => {
    void usePantryStore.getState().deleteItem(item.id);
  };

  const decrementDisabled = item.quantity <= 0;

  const renderRightActions = () => (
    <Pressable
      onPress={handleDelete}
      accessibilityLabel={`Delete ${item.name}`}
      accessibilityRole="button"
      style={styles.deleteAction}
    >
      <Text style={styles.deleteActionText}>Delete</Text>
    </Pressable>
  );

  return (
    <ReanimatedSwipeable
      renderRightActions={renderRightActions}
      friction={2}
      rightThreshold={40}
      overshootRight={false}
    >
      <View style={styles.row}>
        <View style={styles.rowNameWrap}>
          {editing ? (
            <TextInput
              style={styles.rowInput}
              value={draft}
              onChangeText={setDraft}
              onBlur={finishEdit}
              onSubmitEditing={finishEdit}
              autoFocus
              returnKeyType="done"
              accessibilityLabel={`Rename ${item.name}`}
            />
          ) : (
            <Pressable
              onPress={startEdit}
              accessibilityLabel={`Edit ${item.name}`}
              accessibilityRole="button"
              hitSlop={6}
            >
              <Text style={styles.rowName} numberOfLines={1}>
                {item.name}
              </Text>
            </Pressable>
          )}
        </View>

        <View style={styles.stepper}>
          <Pressable
            onPress={handleDecrement}
            disabled={decrementDisabled}
            accessibilityLabel={`Decrease quantity of ${item.name}`}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.stepperButton,
              decrementDisabled && styles.stepperButtonDisabled,
              pressed && !decrementDisabled && styles.stepperButtonPressed,
            ]}
          >
            <Text style={styles.stepperButtonText}>−</Text>
          </Pressable>
          <Text style={styles.qty}>{item.quantity}</Text>
          <Pressable
            onPress={handleIncrement}
            accessibilityLabel={`Increase quantity of ${item.name}`}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.stepperButton,
              pressed && styles.stepperButtonPressed,
            ]}
          >
            <Text style={styles.stepperButtonText}>+</Text>
          </Pressable>
        </View>
      </View>
    </ReanimatedSwipeable>
  );
};

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#fff',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
  },
  wordmark: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111',
  },
  signOutText: {
    fontSize: 14,
    color: '#555',
  },
  headerBlock: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  heading: {
    fontSize: 32,
    fontWeight: '700',
    color: '#111',
  },
  subhead: {
    fontSize: 14,
    color: '#555',
    marginTop: 4,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  addInput: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 16,
    color: '#111',
    backgroundColor: '#fff',
  },
  addButton: {
    marginLeft: 8,
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#111',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonDisabled: {
    backgroundColor: '#ccc',
  },
  addButtonPressed: {
    opacity: 0.7,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 22,
    lineHeight: 24,
    fontWeight: '600',
  },
  suggestRow: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
  },
  suggestButton: {
    height: 48,
    borderRadius: 8,
    backgroundColor: '#111',
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestButtonDisabled: {
    backgroundColor: '#ccc',
  },
  suggestButtonPressed: {
    opacity: 0.7,
  },
  suggestButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  errorBanner: {
    marginHorizontal: 20,
    marginTop: 8,
    backgroundColor: '#fdecea',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  errorBannerText: {
    color: '#b00020',
    fontSize: 13,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptyBody: {
    fontSize: 14,
    color: '#555',
    textAlign: 'center',
    lineHeight: 20,
  },
  listContent: {
    paddingTop: 8,
    paddingBottom: 24,
  },
  separator: {
    height: 1,
    backgroundColor: '#eee',
    marginHorizontal: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 56,
    paddingHorizontal: 20,
    backgroundColor: '#fff',
  },
  rowNameWrap: {
    flex: 1,
    paddingRight: 12,
  },
  rowName: {
    fontSize: 16,
    color: '#111',
  },
  rowInput: {
    fontSize: 16,
    color: '#111',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepperButton: {
    width: 32,
    height: 32,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#eee',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  stepperButtonDisabled: {
    opacity: 0.4,
  },
  stepperButtonPressed: {
    backgroundColor: '#f5f5f5',
  },
  stepperButtonText: {
    fontSize: 18,
    color: '#111',
    lineHeight: 20,
  },
  qty: {
    minWidth: 28,
    textAlign: 'center',
    fontSize: 16,
    color: '#111',
  },
  deleteAction: {
    width: 96,
    backgroundColor: '#b00020',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteActionText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
