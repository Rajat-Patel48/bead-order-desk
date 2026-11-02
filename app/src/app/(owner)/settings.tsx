import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Button, Card, ErrorNote, Field, Sub } from '@/components/ui';
import { api, API_URL } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import type { Settings } from '@/lib/types';

export default function SettingsScreen() {
  const t = useTheme();
  const { user, logout } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['settings'], queryFn: () => api<{ settings: Settings; whatsappApi: boolean }>('/settings') });
  const [f, setF] = useState<Record<string, string | boolean>>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (q.data) {
      const s = q.data.settings;
      setF({ businessName: s.businessName, sendHours: String(s.sendHours), ackHours: String(s.ackHours), notifyHours: String(s.notifyHours), autoNotifyCustomer: s.autoNotifyCustomer });
    }
  }, [q.data]);

  const save = useMutation({
    mutationFn: () =>
      api('/settings', {
        method: 'PUT',
        body: {
          businessName: String(f.businessName ?? ''),
          sendHours: parseFloat(String(f.sendHours)) || 2,
          ackHours: parseFloat(String(f.ackHours)) || 4,
          notifyHours: parseFloat(String(f.notifyHours)) || 2,
          autoNotifyCustomer: !!f.autoNotifyCustomer,
        },
      }),
    onSuccess: () => {
      setSaved(true);
      qc.invalidateQueries();
    },
  });
  const set = (k: string) => (v: string) => {
    setSaved(false);
    setF({ ...f, [k]: v });
  };

  return (
    <ScrollView contentContainerStyle={st.wrap} keyboardShouldPersistTaps="handled">
      <Card>
        <Text style={[st.h, { color: t.ink }]}>Business</Text>
        <Field label="Business name (shown to customers)" value={String(f.businessName ?? '')} onChangeText={set('businessName')} />
      </Card>
      <Card>
        <Text style={[st.h, { color: t.ink }]}>Time limits</Text>
        <Sub>When an order sits longer than this, it turns red and you get a notification.</Sub>
        <Field label="Staff must send to factory within (hours)" value={String(f.sendHours ?? '')} onChangeText={set('sendHours')} keyboardType="decimal-pad" />
        <Field label="Factory must confirm within (hours)" value={String(f.ackHours ?? '')} onChangeText={set('ackHours')} keyboardType="decimal-pad" />
        <Field label="Staff must tell customer within (hours)" value={String(f.notifyHours ?? '')} onChangeText={set('notifyHours')} keyboardType="decimal-pad" />
      </Card>
      <Card>
        <Text style={[st.h, { color: t.ink }]}>WhatsApp</Text>
        <View style={[st.badge, { backgroundColor: q.data?.whatsappApi ? t.accentSoft : t.warnSoft }]}>
          <Text style={{ color: q.data?.whatsappApi ? t.accent : t.warn, fontWeight: '700' }}>
            {q.data?.whatsappApi ? 'Automatic WhatsApp is ON' : 'Automatic WhatsApp is OFF: staff send messages themselves'}
          </Text>
        </View>
        <View style={st.row}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.ink, fontWeight: '700' }}>Message the customer automatically when ready</Text>
            <Sub>Only works when automatic WhatsApp is on and the order has the customer's number.</Sub>
          </View>
          <Switch value={!!f.autoNotifyCustomer} onValueChange={(v) => { setSaved(false); setF({ ...f, autoNotifyCustomer: v }); }} />
        </View>
      </Card>
      <ErrorNote message={q.error?.message || save.error?.message} />
      <Button kind="primary" big title={saved ? 'Saved' : 'Save settings'} loading={save.isPending} onPress={() => save.mutate()} />
      <Card>
        <Sub>
          Logged in as {user?.name} · Server {API_URL}
        </Sub>
        <Button kind="danger" title="Log out" onPress={logout} />
      </Card>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  wrap: { padding: 16, gap: 14, paddingBottom: 40 },
  h: { fontSize: 16, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  badge: { borderRadius: 8, padding: 10 },
});
