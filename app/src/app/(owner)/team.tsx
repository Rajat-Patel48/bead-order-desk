import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Chip, ErrorNote, Field, Sub } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtPhone } from '@/lib/format';
import { useTheme } from '@/lib/theme';
import type { Role, TeamMember } from '@/lib/types';

const ROLE_LABEL: Record<Role, string> = { owner: 'Owner', staff: 'Staff', factory: 'Factory' };

export default function Team() {
  const t = useTheme();
  const { user } = useAuth();
  const qc = useQueryClient();
  const team = useQuery({ queryKey: ['team'], queryFn: () => api<{ users: TeamMember[] }>('/users').then((r) => r.users) });
  const [form, setForm] = useState({ name: '', phone: '', role: 'staff' as Role, pin: '' });
  const [msg, setMsg] = useState<string | null>(null);
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [newPin, setNewPin] = useState('');

  const add = useMutation({
    mutationFn: () => api('/users', { method: 'POST', body: form }),
    onSuccess: () => {
      setMsg(`${form.name} added. Give them their mobile number and PIN to log in.`);
      setForm({ name: '', phone: '', role: 'staff', pin: '' });
      qc.invalidateQueries({ queryKey: ['team'] });
    },
  });
  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => api(`/users/${id}`, { method: 'PATCH', body }),
    onSuccess: () => {
      setResetFor(null);
      setNewPin('');
      qc.invalidateQueries({ queryKey: ['team'] });
    },
  });

  return (
    <ScrollView contentContainerStyle={st.wrap} keyboardShouldPersistTaps="handled">
      <Card>
        <Text style={[st.h, { color: t.ink }]}>Add a person</Text>
        <Sub>Factory workers added here get new orders on WhatsApp and can confirm by replying "OK".</Sub>
        <Field label="Name" value={form.name} onChangeText={(name) => setForm({ ...form, name })} placeholder="e.g. Raju" />
        <Field label="Mobile number" value={form.phone} onChangeText={(phone) => setForm({ ...form, phone })} keyboardType="phone-pad" placeholder="98xxxxxxxx" />
        <View style={st.chips}>
          {(['staff', 'factory', 'owner'] as Role[]).map((r) => (
            <Chip key={r} label={ROLE_LABEL[r]} active={form.role === r} onPress={() => setForm({ ...form, role: r })} />
          ))}
        </View>
        <Field label="PIN (4–6 digits)" value={form.pin} onChangeText={(v) => setForm({ ...form, pin: v.replace(/\D/g, '').slice(0, 6) })} keyboardType="number-pad" />
        <ErrorNote message={add.error?.message} />
        {msg ? <Text style={{ color: t.accent, fontWeight: '700' }}>{msg}</Text> : null}
        <Button kind="primary" title="Add person" loading={add.isPending} onPress={() => { setMsg(null); add.mutate(); }} />
      </Card>

      <ErrorNote message={team.error?.message || patch.error?.message} />
      {(['owner', 'staff', 'factory'] as Role[]).map((role) => {
        const people = (team.data ?? []).filter((u) => u.role === role);
        if (!people.length) return null;
        return (
          <View key={role} style={{ gap: 8 }}>
            <Text style={[st.group, { color: t.muted }]}>{ROLE_LABEL[role]}</Text>
            {people.map((u) => (
              <Card key={u.id} style={{ opacity: u.active ? 1 : 0.6 }}>
                <View style={st.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: t.ink, fontWeight: '700', fontSize: 16 }}>
                      {u.name}
                      {u.id === user?.id ? ' (you)' : ''}
                    </Text>
                    <Sub>
                      {fmtPhone(u.phone)} · {u.active ? (u.has_push ? 'notifications on' : 'no notifications yet') : 'deactivated'}
                    </Sub>
                  </View>
                </View>
                {resetFor === u.id ? (
                  <View style={{ gap: 8 }}>
                    <Field label="New PIN" value={newPin} onChangeText={(v) => setNewPin(v.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" autoFocus />
                    <View style={st.chips}>
                      <Button kind="primary" title="Save PIN" loading={patch.isPending} onPress={() => patch.mutate({ id: u.id, body: { pin: newPin } })} />
                      <Button kind="ghost" title="Cancel" onPress={() => setResetFor(null)} />
                    </View>
                  </View>
                ) : (
                  <View style={st.chips}>
                    <Button title="Reset PIN" onPress={() => { setResetFor(u.id); setNewPin(''); }} />
                    {u.id !== user?.id && (
                      <Button kind={u.active ? 'danger' : 'plain'} title={u.active ? 'Deactivate' : 'Reactivate'} onPress={() => patch.mutate({ id: u.id, body: { active: !u.active } })} />
                    )}
                  </View>
                )}
              </Card>
            ))}
          </View>
        );
      })}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  wrap: { padding: 16, gap: 14, paddingBottom: 40 },
  h: { fontSize: 16, fontWeight: '700' },
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  group: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', marginTop: 6 },
});
