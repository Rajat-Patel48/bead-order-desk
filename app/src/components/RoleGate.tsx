import { Redirect } from 'expo-router';
import type { ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import type { Role } from '@/lib/types';

export const HOME: Record<Role, '/board' | '/orders' | '/queue'> = { owner: '/board', staff: '/orders', factory: '/queue' };

export function RoleGate({ role, children }: { role: Role; children: ReactNode }) {
  const { user, loading } = useAuth();
  const t = useTheme();
  if (loading)
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg }}>
        <ActivityIndicator color={t.accent} />
      </View>
    );
  if (!user) return <Redirect href="/login" />;
  if (user.role !== role) return <Redirect href={HOME[user.role]} />;
  return <>{children}</>;
}
