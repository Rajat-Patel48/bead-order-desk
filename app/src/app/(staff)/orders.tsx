import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { OrderCard } from '@/components/OrderCard';
import { Button, Chip, Empty, ErrorNote, Sub } from '@/components/ui';
import { useOrders } from '@/lib/orders';
import type { Order } from '@/lib/types';

type Filter = 'mine' | 'factory' | 'done';
const NEEDS_YOU = ['created', 'ready', 'notified'];
const AT_FACTORY = ['sent', 'ack', 'production'];

export default function StaffOrders() {
  const [filter, setFilter] = useState<Filter>('mine');
  const open = useOrders('open');
  const done = useOrders('done');

  const lists = useMemo(() => {
    const o = open.data?.orders ?? [];
    const byUrgency = (a: Order, b: Order) => b.alerts.length - a.alerts.length || +new Date(a.status_at) - +new Date(b.status_at);
    return {
      mine: o.filter((x) => NEEDS_YOU.includes(x.status)).sort(byUrgency),
      factory: o.filter((x) => AT_FACTORY.includes(x.status)).sort(byUrgency),
      done: (done.data?.orders ?? []).slice(0, 50),
    };
  }, [open.data, done.data]);

  const data = lists[filter];
  const q = filter === 'done' ? done : open;
  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={data}
        keyExtractor={(o) => o.id}
        contentContainerStyle={st.list}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => { q.refetch(); }} />}
        ListHeaderComponent={
          <View style={{ gap: 12, marginBottom: 12 }}>
            <Button big kind="primary" title="+ New order" onPress={() => router.push('/new-order')} />
            <View style={st.chips}>
              <Chip label={`Needs you · ${lists.mine.length}`} active={filter === 'mine'} onPress={() => setFilter('mine')} />
              <Chip label={`At factory · ${lists.factory.length}`} active={filter === 'factory'} onPress={() => setFilter('factory')} />
              <Chip label="Done" active={filter === 'done'} onPress={() => setFilter('done')} />
            </View>
            <ErrorNote message={q.error?.message} />
          </View>
        }
        renderItem={({ item }) => <OrderCard order={item} />}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListEmptyComponent={
          q.isLoading ? (
            <Sub>Loading orders…</Sub>
          ) : (
            <Empty
              title={filter === 'mine' ? 'Nothing waiting on you' : filter === 'factory' ? 'Nothing at the factory' : 'No finished orders yet'}
              body={filter === 'mine' ? 'New orders you take, and orders the factory marks ready, show up here.' : undefined}
            />
          )
        }
      />
    </View>
  );
}

const st = StyleSheet.create({
  list: { padding: 16, paddingBottom: 40 },
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
});
