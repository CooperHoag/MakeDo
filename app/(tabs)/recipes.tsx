import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  FlatList,
  type ListRenderItem,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useRecipeStore } from '@/stores/recipeStore';
import type { RecipeSuggestion } from '@/types/recipe';

export default function RecipesScreen() {
  const recipes = useRecipeStore((state) => state.recipes);
  const loading = useRecipeStore((state) => state.loading);
  const error = useRecipeStore((state) => state.error);
  const router = useRouter();

  const handleRetry = () => {
    void useRecipeStore.getState().fetchRecipes();
  };

  const handleOpenRecipe = (index: number) => {
    router.push({
      pathname: '/recipe-detail',
      params: { recipeIndex: String(index) },
    });
  };

  const renderItem: ListRenderItem<RecipeSuggestion> = ({ item, index }) => (
    <Pressable
      onPress={() => handleOpenRecipe(index)}
      accessibilityLabel={`Recipe: ${item.name}`}
      accessibilityRole="button"
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <Text style={styles.cardTitle} numberOfLines={2}>
        {item.name}
      </Text>
      <Text style={styles.cardDesc} numberOfLines={2}>
        {item.description}
      </Text>
      <Text style={styles.cardFooter}>
        {`${item.ingredients_used.length} from your pantry · ${item.ingredients_needed.length} to grab · ~${item.estimated_minutes} min`}
      </Text>
    </Pressable>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.headerBlock}>
        <Text style={styles.heading}>Recipes</Text>
        <Text style={styles.subhead}>Built from what you have on hand.</Text>
      </View>

      {loading ? (
        <View style={styles.centered} accessibilityLabel="Loading recipes">
          <ActivityIndicator />
          <Text style={styles.loadingText}>Looking through your pantry…</Text>
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>{error}</Text>
          </View>
          <Pressable
            onPress={handleRetry}
            accessibilityLabel="Try again"
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.retryButton,
              pressed && styles.retryButtonPressed,
            ]}
          >
            <Text style={styles.retryButtonText}>Try again</Text>
          </Pressable>
        </View>
      ) : recipes.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>No recipes yet.</Text>
          <Text style={styles.emptyBody}>
            Head to your pantry and tap What can I make? to see ideas built from
            what you have.
          </Text>
        </View>
      ) : (
        <FlatList
          data={recipes}
          keyExtractor={(_, index) => String(index)}
          renderItem={renderItem}
          ItemSeparatorComponent={Separator}
          contentContainerStyle={styles.listContent}
        />
      )}
    </SafeAreaView>
  );
}

const Separator = () => <View style={styles.separator} />;

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#fff',
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
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#555',
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
  errorBanner: {
    width: '100%',
    backgroundColor: '#fdecea',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 16,
  },
  errorBannerText: {
    color: '#b00020',
    fontSize: 13,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#111',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonPressed: {
    opacity: 0.7,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 24,
  },
  separator: {
    height: 12,
  },
  card: {
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 8,
    padding: 16,
    backgroundColor: '#fff',
  },
  cardPressed: {
    backgroundColor: '#fafafa',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111',
  },
  cardDesc: {
    marginTop: 4,
    fontSize: 14,
    color: '#555',
  },
  cardFooter: {
    marginTop: 8,
    fontSize: 12,
    color: '#777',
  },
});
