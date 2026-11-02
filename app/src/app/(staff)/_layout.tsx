import { Stack } from 'expo-router';
import { LogoutButton } from '@/components/LogoutButton';
import { RoleGate } from '@/components/RoleGate';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';

export default function StaffLayout() {
  const t = useTheme();
  const { businessName } = useAuth();
  return (
    <RoleGate role="staff">
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: t.surface },
          headerTintColor: t.ink,
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: t.bg },
          headerRight: () => <LogoutButton />,
        }}
      >
        <Stack.Screen name="orders" options={{ title: businessName || 'Orders' }} />
      </Stack>
    </RoleGate>
  );
}
