import { Tabs } from 'expo-router/js-tabs';
import { Text, type ColorValue } from 'react-native';
import { RoleGate } from '@/components/RoleGate';
import { useTheme } from '@/lib/theme';

const icon = (glyph: string) => ({ color }: { color: ColorValue }) => <Text style={{ color, fontSize: 18 }}>{glyph}</Text>;

export default function OwnerLayout() {
  const t = useTheme();
  return (
    <RoleGate role="owner">
      <Tabs
        screenOptions={{
          headerStyle: { backgroundColor: t.surface },
          headerTintColor: t.ink,
          headerTitleStyle: { fontWeight: '700' },
          tabBarActiveTintColor: t.accent,
          tabBarInactiveTintColor: t.muted,
          tabBarStyle: { backgroundColor: t.surface, borderTopColor: t.line },
          sceneStyle: { backgroundColor: t.bg },
        }}
      >
        <Tabs.Screen name="board" options={{ title: 'Orders', tabBarIcon: icon('▤') }} />
        <Tabs.Screen name="reports" options={{ title: 'Reports', tabBarIcon: icon('◷') }} />
        <Tabs.Screen name="team" options={{ title: 'Team', tabBarIcon: icon('☺') }} />
        <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: icon('⚙') }} />
      </Tabs>
    </RoleGate>
  );
}
