import { Pressable, Text } from 'react-native';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';

export function LogoutButton() {
  const t = useTheme();
  const { logout } = useAuth();
  return (
    <Pressable onPress={logout} style={{ paddingHorizontal: 16 }} accessibilityRole="button">
      <Text style={{ color: t.muted, fontWeight: '700' }}>Log out</Text>
    </Pressable>
  );
}
