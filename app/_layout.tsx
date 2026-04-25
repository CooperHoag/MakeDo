import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useAuthStore } from '@/stores/authStore';

export default function RootLayout() {
  const initialized = useAuthStore((state) => state.initialized);
  const session = useAuthStore((state) => state.session);
  const profile = useAuthStore((state) => state.profile);
  const profileLoaded = useAuthStore((state) => state.profileLoaded);
  const router = useRouter();
  const segments = useSegments();
  const initStartedRef = useRef(false);

  useEffect(() => {
    if (initStartedRef.current) {
      return;
    }
    initStartedRef.current = true;
    void useAuthStore.getState().initialize();
  }, []);

  useEffect(() => {
    if (!initialized) {
      return;
    }
    const inAuthGroup = segments[0] === '(auth)';
    const onOnboarding = segments[0] === 'onboarding';

    if (!session && !inAuthGroup) {
      router.replace('/sign-in');
      return;
    }
    if (session && !profileLoaded) {
      // Wait until the profile finishes loading before deciding where to send
      // a signed-in user — prevents a flash of /onboarding for returning users.
      return;
    }
    if (
      session &&
      profile?.onboarding_complete === false &&
      !onOnboarding
    ) {
      router.replace('/onboarding');
      return;
    }
    if (
      session &&
      profile?.onboarding_complete !== false &&
      (inAuthGroup || onOnboarding)
    ) {
      router.replace('/');
    }
  }, [initialized, session, profileLoaded, profile, segments, router]);

  if (!initialized) {
    return (
      <View style={styles.loading} accessibilityLabel="Loading">
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="onboarding" />
    </Stack>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
