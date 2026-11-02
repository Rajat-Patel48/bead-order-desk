import { useQuery } from '@tanstack/react-query';
import { router, useNavigation } from 'expo-router';
import { useLayoutEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import { OrderCard } from '@/components/OrderCard';
import { Empty, ErrorNote, Sub } from '@/components/ui';
import { api } from '@/lib/api';
import { useOrders } from '@/lib/orders';
import { useTheme } from '@/lib/theme';
import type { Dashboard, Order, Status } from '@/lib/types';

const GROUPS: [Status, string][] = [
  ['ready', 'Ready: customer not told yet'],
  ['notified', 'Customer told: waiting for pickup'],
  ['production', 'Being made at the factory'],
  ['ack', 'Factory has it: not started yet'],
  ['sent', "Sent: factory hasn't confirmed"],
  ['created', 'Taken: not sent to factory yet'],
];

export default function Board() {
  const t = useTheme();
  const nav = useNavigation();
  const [search, setSearch] = useState('');
  const [attentionOnly, setAttentionOnly] = useState(false);
  const orders = useOrders('open', search);
  const dash = useQuery({ queryKey: ['dashboard'], queryFn: () => api<Dashboard>('/dashboard'), refetchInterval: 30_000 });

  useLayoutEffect(() => {
    nav.setOptions({
      headerRight: () => (
        <Pressable onPress={() => router.push('/new-order')} style={{ paddingHorizontal: 16 }} accessibilityRole="button">
          <Text style={{ color: t.accent, fontWeight: '700', fontSize: 16 }}>+ New</Text>
        </Pressable>
      ),
    });
  }, [nav, t.accent]);

  const sections = useMemo(() => {
    const list = (orders.data?.orders ?? []).filter((o) => !attentionOnly || o.alerts.length);
    return GROUPS.map(([st, title]) => ({
      st,
      title,
      data: list.filter((o) => o.status === st).sort((a, b) => +new Date(a.status_at) - +new Date(b.status_at)),
    })).filter((s) => s.data.length);
  }, [orders.data, attentionOnly]);

  const c = dash.data?.counts;
  return (
    <SectionList<Order, { st: Status; title: string; data: Order[] }>
      sections={sections}
      keyExtractor={(o) => o.id}
      contentContainerStyle={st.list}
      stickySectionHeadersEnabled={false}
      refreshControl={<RefreshControl refreshing={orders.isRefetching} onRefresh={() => { orders.refetch(); dash.refetch(); }} />}
      ListHeaderComponent={
        <View style={{ gap: 12, marginBottom: 4 }}>
          <Sub>Updates the moment staff or the factory tap a button. No need to call anyone.</Sub>
          {c && (
            <View style={st.stats}>
              <Stat n={c.open} label="Open orders" />
              <Stat n={c.unconfirmed} label="Factory hasn't confirmed" tone={c.unconfirmed ? 'warn' : undefined} />
              <Stat n={c.readyNotTold} label="Ready, customer not told" tone={c.readyNotTold ? 'warn' : undefined} />
              <Stat n={c.attention} label="Need attention" tone={c.attention ? 'crit' : undefined} onPress={() => setAttentionOnly((v) => !v)} active={attentionOnly} />
            </View>
          )}
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Find by customer, order no. or item (e.g. TR 216)"
            placeholderTextColor={t.muted}
            style={[st.search, { color: t.ink, backgroundColor: t.surface, borderColor: t.line }]}
            clearButtonMode="while-editing"
          />
          {attentionOnly ? <Sub>Showing only orders that need attention. Tap the red box again to show all.</Sub> : null}
          <ErrorNote message={orders.error?.message} />
        </View>
      }
      renderSectionHeader={({ section }) => (
        <View style={st.secHead}>
          <View style={[st.dot, { backgroundColor: t.st[section.st] }]} />
          <Text style={[st.secTitle, { color: t.ink }]}>{section.title}</Text>
          <Text style={{ color: t.muted, fontFamily: 'monospace' }}>{section.data.length}</Text>
        </View>
      )}
      renderItem={({ item }) => <OrderCard order={item} showActions={false} />}
      ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
      ListEmptyComponent={
        orders.isLoading ? <Sub>Loading orders…</Sub> : <Empty title={search ? 'No open order matches' : 'No open orders'} body={search ? undefined : 'Tap "+ New" to take an order.'} />
      }
    />
  );
}

function Stat({ n, label, tone, onPress, active }: { n: number; label: string; tone?: 'warn' | 'crit'; onPress?: () => void; active?: boolean }) {
  const t = useTheme();
  const color = tone === 'crit' ? t.crit : tone === 'warn' ? t.warn : t.ink;
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={[st.stat, { backgroundColor: t.surface, borderColor: active ? t.crit : t.line }]}>
      <Text style={[st.statN, { color }]}>{n}</Text>
      <Text style={{ color: t.muted, fontSize: 12 }}>{label}</Text>
    </Pressable>
  );
}

const st = StyleSheet.create({
  list: { padding: 16, paddingBottom: 40 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stat: { flexGrow: 1, flexBasis: '45%', borderWidth: 1, borderRadius: 12, padding: 12 },
  statN: { fontSize: 26, fontWeight: '800' },
  search: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  secHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18, marginBottom: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  secTitle: { fontWeight: '700', fontSize: 15, flex: 1 },
});
