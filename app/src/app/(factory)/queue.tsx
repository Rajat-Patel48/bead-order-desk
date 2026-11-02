import { useMemo } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { OrderCard } from '@/components/OrderCard';
import { Empty, ErrorNote, Sub } from '@/components/ui';
import { fmtWhen } from '@/lib/format';
import { useOrders } from '@/lib/orders';
import { useTheme } from '@/lib/theme';
import { LABEL, STAGES } from '@/lib/types';

export default function FactoryQueue() {
  const t = useTheme();
  const q = useOrders('open');
  const { todo, recent } = useMemo(() => {
    const all = q.data?.orders ?? [];
    const todo = all
      .filter((o) => ['sent', 'ack', 'production'].includes(o.status))
      .sort((a, b) => STAGES.indexOf(a.status) - STAGES.indexOf(b.status) || (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'));
    const recent = all.filter((o) => ['ready', 'notified', 'delivered'].includes(o.status));
    return { todo, recent };
  }, [q.data]);

  return (
    <FlatList
      data={todo}
      keyExtractor={(o) => o.id}
      contentContainerStyle={st.list}
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => { q.refetch(); }} />}
      ListHeaderComponent={
        <View style={{ gap: 8, marginBottom: 12 }}>
          <Sub>Tap "I received this order" as soon as you get it. You can also reply OK on WhatsApp.</Sub>
          <ErrorNote message={q.error?.message} />
        </View>
      }
      renderItem={({ item }) => <OrderCard order={item} bigItems />}
      ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
      ListEmptyComponent={q.isLoading ? <Sub>Loading orders…</Sub> : <Empty title="No orders waiting" body="New orders from the shop appear here." />}
      ListFooterComponent={
        recent.length ? (
          <View style={{ marginTop: 24, gap: 6 }}>
            <Text style={[st.h, { color: t.muted }]}>Marked ready, last 3 days</Text>
            {recent.map((o) => {
              const ev = [...o.events].reverse().find((e) => e.status === 'ready');
              return (
                <View key={o.id} style={[st.row, { borderColor: t.line }]}>
                  <Text style={{ color: t.ink, fontFamily: 'monospace', fontWeight: '700' }}>{o.code}</Text>
                  <Text style={{ color: t.ink, flex: 1 }} numberOfLines={1}>
                    {o.customer_name}
                  </Text>
                  <Sub>
                    {LABEL[o.status]}
                    {ev ? ` · ${fmtWhen(ev.at)}` : ''}
                  </Sub>
                </View>
              );
            })}
          </View>
        ) : undefined
      }
    />
  );
}

const st = StyleSheet.create({
  list: { padding: 16, paddingBottom: 40 },
  h: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  row: { flexDirection: 'row', gap: 10, alignItems: 'center', borderTopWidth: 1, paddingTop: 8 },
});
