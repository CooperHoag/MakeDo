import { useState } from 'react';
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useAuthStore } from '@/stores/authStore';

const BODY_COPY =
  "MakeDo is built on a simple idea: you already have more than enough.\n\n" +
  "Every day, you're sold something new — a product, a subscription, the next must-have thing. We push back. MakeDo helps you cook with what's already in your pantry, move with your own body, and notice what you've already got going for you.\n\n" +
  "This isn't about deprivation. It's about creativity, resourcefulness, and quietly opting out of the noise.";

export default function OnboardingScreen() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGetStarted = async () => {
    setError(null);
    setLoading(true);
    const { error: completeError } = await useAuthStore
      .getState()
      .completeOnboarding();
    if (completeError) {
      setError(completeError.message);
    }
    setLoading(false);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Welcome to MakeDo</Text>
        <Text style={styles.body}>{BODY_COPY}</Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          style={({ pressed }) => [
            styles.button,
            (loading || pressed) && styles.buttonPressed,
          ]}
          onPress={handleGetStarted}
          disabled={loading}
          accessibilityLabel="Get started"
          accessibilityRole="button"
        >
          <Text style={styles.buttonText}>
            {loading ? 'One moment…' : "Let's make do"}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#fff',
  },
  container: {
    flexGrow: 1,
    padding: 24,
    justifyContent: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '600',
    marginBottom: 16,
    color: '#111',
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    color: '#333',
    marginBottom: 24,
  },
  button: {
    backgroundColor: '#111',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonPressed: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  error: {
    color: '#b00020',
    marginBottom: 12,
    fontSize: 14,
  },
});
