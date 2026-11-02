import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { HOME } from '@/components/RoleGate';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';

export default function Index() {
  const { user, loading } = useAuth();
  const t = useTheme();
  if (loading)
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg }}>
        <ActivityIndicator color={t.accent} />
      </View>
    );
  return <Redirect href={user ? HOME[user.role] : '/login'} />;
}
