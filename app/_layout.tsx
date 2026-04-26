import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

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
      <GestureHandlerRootView style={styles.root}>
        <View style={styles.loading} accessibilityLabel="Loading">
          <ActivityIndicator />
        </View>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="recipe-detail" options={{ headerShown: true }} />
      </Stack>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
