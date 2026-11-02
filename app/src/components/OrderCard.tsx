import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@/lib/auth';
import { ago, fmtDate } from '@/lib/format';
import { useTheme } from '@/lib/theme';
import { LABEL, type Order } from '@/lib/types';
import { OrderActions } from './OrderActions';
import { Alerts, Card, Rail, StatusPill } from './ui';

export function ItemLines({ order, limit, big }: { order: Order; limit?: number; big?: boolean }) {
  const t = useTheme();
  const items = limit && order.items.length > limit + 1 ? order.items.slice(0, limit) : order.items;
  return (
    <View style={[st.items, { borderTopColor: t.line }]}>
      {items.map((it) => (
        <View key={it.id} style={st.itemRow}>
          <Text style={[st.itemName, { color: t.ink, fontSize: big ? 17 : 14 }]}>{it.name}</Text>
          <Text style={[st.qty, { color: t.ink, fontSize: big ? 17 : 14, fontWeight: big ? '700' : '400' }]}>
            {it.qty} {it.unit}
          </Text>
        </View>
      ))}
      {items.length < order.items.length ? <Text style={{ color: t.muted, fontSize: 13 }}>+ {order.items.length - items.length} more items</Text> : null}
    </View>
  );
}

export function OrderCard({ order, showActions = true, bigItems }: { order: Order; showActions?: boolean; bigItems?: boolean }) {
  const t = useTheme();
  const { user } = useAuth();
  const last = order.events[order.events.length - 1];
  return (
    <Card danger={order.alerts.some((a) => a.level === 'crit')}>
      <Pressable onPress={() => router.push(`/order/${order.id}`)} accessibilityRole="button" accessibilityLabel={`Open order ${order.code}`} style={{ gap: 8 }}>
        <View style={st.head}>
          <Text style={[st.code, { color: t.muted }]}>{order.code}</Text>
          <Text style={[st.cust, { color: t.ink }]} numberOfLines={1}>
            {order.customer_name}
          </Text>
          <StatusPill status={order.status} />
        </View>
        <Text style={{ color: t.muted, fontSize: 13 }}>
          {[order.due_date ? `Due ${fmtDate(order.due_date)}` : null, `${order.items.length} items`, last ? `${LABEL[order.status]} ${ago(last.at)}` : null, user?.role !== 'factory' ? `by ${order.created_by_name ?? '—'}` : null]
            .filter(Boolean)
            .join(' · ')}
        </Text>
        <Rail status={order.status} />
        <Alerts alerts={user?.role === 'factory' ? order.alerts.filter((a) => a.owner === 'factory') : order.alerts} />
        <ItemLines order={order} limit={bigItems ? undefined : 3} big={bigItems} />
        {order.note ? <Text style={{ color: t.muted, fontSize: 13 }}>Note: {order.note}</Text> : null}
      </Pressable>
      {showActions ? <OrderActions order={order} /> : null}
    </Card>
  );
}

const st = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  code: { fontFamily: 'monospace', fontWeight: '700', fontSize: 13 },
  cust: { fontWeight: '700', fontSize: 16, flexShrink: 1 },
  items: { borderTopWidth: 1, borderStyle: 'dashed', paddingTop: 8, gap: 3 },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  itemName: { flexShrink: 1 },
  qty: { fontFamily: 'monospace' },
});
