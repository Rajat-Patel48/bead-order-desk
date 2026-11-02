import { useQuery } from '@tanstack/react-query';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card, ErrorNote, Sub } from '@/components/ui';
import { api } from '@/lib/api';
import { fmtDur } from '@/lib/format';
import { useTheme } from '@/lib/theme';
import type { Dashboard } from '@/lib/types';

export default function Reports() {
  const t = useTheme();
  const q = useQuery({ queryKey: ['dashboard'], queryFn: () => api<Dashboard>('/dashboard'), refetchInterval: 30_000 });
  const d = q.data;
  const cell = { color: t.ink, fontSize: 14 } as const;
  const num = { ...cell, fontFamily: 'monospace', textAlign: 'right' as const };
  return (
    <ScrollView contentContainerStyle={st.wrap} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => { q.refetch(); }} />}>
      <ErrorNote message={q.error?.message} />
      <Card>
        <Text style={[st.h, { color: t.ink }]}>How long each step takes</Text>
        <Sub>Average over orders taken in the last 30 days.</Sub>
        {d?.steps.map((s) => (
          <View key={s.label} style={[st.row, { borderTopColor: t.line }]}>
            <View style={{ flex: 1 }}>
              <Text style={cell}>{s.label}</Text>
              <Sub>
                {s.owner === 'staff' ? "Staff's job" : "Factory's job"} · {s.count} orders
              </Sub>
            </View>
            <View>
              <Text style={num}>{s.avgMs != null ? fmtDur(s.avgMs) : '–'}</Text>
              <Sub style={{ textAlign: 'right' }}>slowest {s.maxMs != null ? fmtDur(s.maxMs) : '–'}</Sub>
            </View>
          </View>
        ))}
      </Card>
      <Card>
        <Text style={[st.h, { color: t.ink }]}>Staff: getting orders to the factory</Text>
        {d && !d.staff.length ? <Sub>Shows up once staff start taking orders.</Sub> : null}
        {d?.staff.map((s) => (
          <View key={s.name} style={[st.row, { borderTopColor: t.line }]}>
            <View style={{ flex: 1 }}>
              <Text style={[cell, { fontWeight: '700' }]}>{s.name}</Text>
              <Sub>
                {s.taken} orders · average {s.avgSendMs != null ? fmtDur(s.avgSendMs) : '–'} to send
              </Sub>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={num}>{s.notSent} not sent</Text>
              {s.late ? <Text style={[num, { color: t.crit, fontWeight: '700' }]}>{s.late} late</Text> : null}
            </View>
          </View>
        ))}
      </Card>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  wrap: { padding: 16, gap: 14, paddingBottom: 40 },
  h: { fontSize: 16, fontWeight: '700' },
  row: { flexDirection: 'row', gap: 12, borderTopWidth: 1, paddingTop: 10, alignItems: 'center' },
});
