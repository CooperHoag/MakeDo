import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useRecipeStore } from '@/stores/recipeStore';

export default function RecipeDetailScreen() {
  const { recipeIndex } = useLocalSearchParams<{ recipeIndex: string }>();
  const recipes = useRecipeStore((state) => state.recipes);
  const router = useRouter();

  const parsed = Number.parseInt(recipeIndex ?? '', 10);
  const recipe =
    Number.isFinite(parsed) && parsed >= 0 && parsed < recipes.length
      ? recipes[parsed]
      : undefined;

  if (!recipe) {
    return (
      <SafeAreaView style={styles.safe}>
        <Stack.Screen options={{ headerShown: true, title: 'Recipe' }} />
        <View style={styles.fallback}>
          <Text style={styles.fallbackTitle}>Recipe not available.</Text>
          <Text style={styles.fallbackBody}>
            Try generating new recipes from your pantry.
          </Text>
          <Pressable
            onPress={() => router.replace('/')}
            accessibilityLabel="Back to pantry"
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.fallbackButton,
              pressed && styles.fallbackButtonPressed,
            ]}
          >
            <Text style={styles.fallbackButtonText}>Back to pantry</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ headerShown: true, title: recipe.name }} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>{recipe.name}</Text>
        <Text style={styles.description}>{recipe.description}</Text>

        {recipe.ingredients_used.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>From your pantry</Text>
            {recipe.ingredients_used.map((u, i) => (
              <Text key={`used-${i}`} style={styles.listItem}>
                {u.name}
              </Text>
            ))}
          </View>
        ) : null}

        {recipe.ingredients_needed.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>You'll also need</Text>
            {recipe.ingredients_needed.map((n, i) => (
              <Text key={`need-${i}`} style={styles.listItem}>
                {n}
              </Text>
            ))}
          </View>
        ) : null}

        {recipe.steps.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Steps</Text>
            {recipe.steps.map((s, i) => (
              <View key={`step-${i}`} style={styles.stepRow}>
                <Text style={styles.stepNumber}>{i + 1}.</Text>
                <Text style={styles.stepText}>{s}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <Text style={styles.footer}>{`~${recipe.estimated_minutes} minutes`}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#111',
  },
  description: {
    marginTop: 8,
    fontSize: 15,
    color: '#444',
    lineHeight: 22,
  },
  section: {
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111',
    marginBottom: 8,
  },
  listItem: {
    fontSize: 15,
    color: '#222',
    lineHeight: 24,
  },
  stepRow: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  stepNumber: {
    width: 24,
    fontSize: 15,
    color: '#777',
    fontWeight: '600',
    lineHeight: 24,
  },
  stepText: {
    flex: 1,
    fontSize: 15,
    color: '#222',
    lineHeight: 24,
  },
  footer: {
    marginTop: 24,
    fontSize: 13,
    color: '#777',
    textAlign: 'center',
  },
  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  fallbackTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111',
    marginBottom: 8,
    textAlign: 'center',
  },
  fallbackBody: {
    fontSize: 14,
    color: '#555',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  fallbackButton: {
    backgroundColor: '#111',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  fallbackButtonPressed: {
    opacity: 0.7,
  },
  fallbackButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
