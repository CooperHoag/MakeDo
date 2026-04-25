import { useState } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { useAuthStore } from '@/stores/authStore';

export default function HomeScreen() {
  const user = useAuthStore((state) => state.user);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignOut = async () => {
    setError(null);
    setLoading(true);
    const { error: signOutError } = await useAuthStore.getState().signOut();
    if (signOutError) {
      setError(signOutError.message);
    }
    setLoading(false);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.title}>MakeDo</Text>
        <Text style={styles.subtitle}>Phase 1</Text>
        {user?.email ? <Text style={styles.email}>{user.email}</Text> : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          style={({ pressed }) => [
            styles.button,
            (loading || pressed) && styles.buttonPressed,
          ]}
          onPress={handleSignOut}
          disabled={loading}
          accessibilityLabel="Sign out"
          accessibilityRole="button"
        >
          <Text style={styles.buttonText}>{loading ? 'Signing out…' : 'Sign out'}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#fff',
  },
  container: {
    flex: 1,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 36,
    fontWeight: '700',
    color: '#111',
  },
  subtitle: {
    fontSize: 16,
    color: '#555',
    marginTop: 4,
  },
  email: {
    fontSize: 14,
    color: '#333',
    marginTop: 16,
  },
  button: {
    marginTop: 32,
    backgroundColor: '#111',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
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
    marginTop: 16,
    fontSize: 14,
  },
});
