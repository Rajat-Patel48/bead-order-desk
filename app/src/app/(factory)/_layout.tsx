import { Stack } from 'expo-router';
import { LogoutButton } from '@/components/LogoutButton';
import { RoleGate } from '@/components/RoleGate';
import { useTheme } from '@/lib/theme';

export default function FactoryLayout() {
  const t = useTheme();
  return (
    <RoleGate role="factory">
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: t.surface },
          headerTintColor: t.ink,
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: t.bg },
          headerRight: () => <LogoutButton />,
        }}
      >
        <Stack.Screen name="queue" options={{ title: 'Factory orders' }} />
      </Stack>
    </RoleGate>
  );
}
