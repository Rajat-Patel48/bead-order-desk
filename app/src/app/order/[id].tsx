import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Linking, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ItemLines } from '@/components/OrderCard';
import { OrderActions } from '@/components/OrderActions';
import { Alerts, Card, ErrorNote, Rail, StatusPill, Sub } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { fmtDate, fmtPhone, fmtWhen } from '@/lib/format';
import { useOrder } from '@/lib/orders';
import { useTheme } from '@/lib/theme';
import { LABEL, VIA_LABEL } from '@/lib/types';

export default function OrderDetail() {
  const t = useTheme();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useOrder(String(id));
  const o = q.data;

  if (q.isLoading) return <ActivityIndicator style={{ marginTop: 40 }} color={t.accent} />;
  if (!o) return <View style={{ padding: 16 }}><ErrorNote message={q.error?.message ?? 'Order not found.'} /></View>;

  return (
    <ScrollView contentContainerStyle={st.wrap} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => { q.refetch(); }} />}>
      <Card danger={o.alerts.some((a) => a.level === 'crit')}>
        <View style={st.head}>
          <Text style={[st.code, { color: t.muted }]}>{o.code}</Text>
          <StatusPill status={o.status} />
        </View>
        <Text style={[st.cust, { color: t.ink }]}>{o.customer_name}</Text>
        {o.customer_phone ? (
          <Text style={{ color: t.accent, fontWeight: '700' }} onPress={() => Linking.openURL(`tel:+${o.customer_phone}`).catch(() => {})}>
            {fmtPhone(o.customer_phone)}
          </Text>
        ) : null}
        <Sub>
          {[o.due_date ? `Due ${fmtDate(o.due_date)}` : 'No due date', user?.role !== 'factory' ? `Taken by ${o.created_by_name ?? '—'}` : null].filter(Boolean).join(' · ')}
        </Sub>
        <Rail status={o.status} />
        <Alerts alerts={o.alerts} />
        <ItemLines order={o} big={user?.role === 'factory'} />
        {o.note ? <Text style={{ color: t.ink }}>Note: {o.note}</Text> : null}
        <OrderActions order={o} />
      </Card>

      <Card>
        <Text style={[st.h, { color: t.ink }]}>Who did what</Text>
        {o.events.map((e, i) => (
          <View key={i} style={[st.ev, { borderLeftColor: t.st[e.status] }]}>
            <Text style={{ color: t.ink, fontWeight: '700' }}>
              {LABEL[e.status]}
              {e.detail === 'skipped' ? <Text style={{ color: t.muted, fontWeight: '400' }}> (skipped)</Text> : null}
            </Text>
            <Sub>
              {fmtWhen(e.at)} · {e.actor ?? (e.via === 'whatsapp_api' ? 'Automatic' : '—')}
              {VIA_LABEL[e.via] ? ` · ${VIA_LABEL[e.via]}` : ''}
            </Sub>
            {e.via === 'whatsapp_reply' && e.detail ? <Sub>Reply: "{e.detail}"</Sub> : null}
          </View>
        ))}
        {o.factory_msg_status ? <Sub>Factory WhatsApp message: {o.factory_msg_status}</Sub> : null}
        {o.customer_msg_status ? <Sub>Customer WhatsApp message: {o.customer_msg_status}</Sub> : null}
      </Card>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  wrap: { padding: 16, gap: 14, paddingBottom: 40 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  code: { fontFamily: 'monospace', fontWeight: '700', fontSize: 15 },
  cust: { fontSize: 22, fontWeight: '800' },
  h: { fontSize: 16, fontWeight: '700' },
  ev: { borderLeftWidth: 3, paddingLeft: 10, gap: 2 },
});
