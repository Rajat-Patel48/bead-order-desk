import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { AuthProvider, useAuth } from '@/lib/auth';
import { listenForNotificationTaps, registerForPush } from '@/lib/push';
import { useTheme } from '@/lib/theme';

// Refetch when the app comes back to the foreground
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (s) => focusManager.setFocused(s === 'active'));
}

function PushSetup() {
  const { user } = useAuth();
  useEffect(() => {
    if (!user) return;
    registerForPush();
    return listenForNotificationTaps();
  }, [user?.id]);
  return null;
}

export default function RootLayout() {
  const [qc] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 5_000 } } }));
  const t = useTheme();
  return (
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <PushSetup />
        <StatusBar style="auto" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: t.surface },
            headerTintColor: t.ink,
            headerTitleStyle: { fontWeight: '700' },
            contentStyle: { backgroundColor: t.bg },
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="(owner)" options={{ headerShown: false }} />
          <Stack.Screen name="(staff)" options={{ headerShown: false }} />
          <Stack.Screen name="(factory)" options={{ headerShown: false }} />
          <Stack.Screen name="order/[id]" options={{ title: 'Order' }} />
          <Stack.Screen name="new-order" options={{ title: 'New order', presentation: 'modal' }} />
        </Stack>
      </AuthProvider>
    </QueryClientProvider>
  );
}
