import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, Card, Chip, ErrorNote, Field, Sub } from '@/components/ui';
import { api } from '@/lib/api';
import { fmtDate, ymdPlus } from '@/lib/format';
import { useCreateOrder } from '@/lib/orders';
import { useTheme } from '@/lib/theme';
import type { Item } from '@/lib/types';

interface Line {
  key: string;
  itemId?: number;
  name: string;
  unit: string;
  qty: string;
  custom?: boolean;
}

function useDebounced<T>(v: T, ms = 250) {
  const [d, setD] = useState(v);
  useEffect(() => {
    const id = setTimeout(() => setD(v), ms);
    return () => clearTimeout(id);
  }, [v, ms]);
  return d;
}

const DUE = [
  ['Today', 0],
  ['Tomorrow', 1],
  ['3 days', 3],
  ['1 week', 7],
] as const;

export default function NewOrder() {
  const t = useTheme();
  const [customer, setCustomer] = useState('');
  const [phone, setPhone] = useState('');
  const [due, setDue] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [search, setSearch] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const create = useCreateOrder();

  const term = useDebounced(search.trim());
  const results = useQuery({
    queryKey: ['items', term],
    queryFn: () => api<{ items: Item[] }>(`/items?q=${encodeURIComponent(term)}`).then((r) => r.items),
    enabled: term.length > 0,
    staleTime: 60_000,
  });

  const add = (l: Omit<Line, 'key' | 'qty'>) => {
    setLines((ls) => [...ls, { ...l, qty: '', key: `${Date.now()}-${ls.length}` }]);
    setSearch('');
  };
  const setQty = (key: string, qty: string) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, qty: qty.replace(/[^\d.]/g, '') } : l)));

  const save = async () => {
    setErr(null);
    if (!customer.trim()) return setErr('Add the customer name.');
    if (!lines.length) return setErr('Add at least one item.');
    if (lines.some((l) => !(parseFloat(l.qty) > 0))) return setErr('Every item needs a quantity.');
    try {
      const o = await create.mutateAsync({
        customerName: customer.trim(),
        customerPhone: phone,
        dueDate: due,
        note,
        items: lines.map((l) => (l.itemId ? { itemId: l.itemId, qty: parseFloat(l.qty) } : { name: l.name, qty: parseFloat(l.qty) })),
      });
      router.replace(`/order/${o.id}`);
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={st.wrap} keyboardShouldPersistTaps="handled">
        <Card>
          <Field label="Customer name" value={customer} onChangeText={setCustomer} placeholder="e.g. Shree Ganesh Traders" autoCapitalize="words" />
          <Field label="Customer WhatsApp number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="98xxxxxxxx" />
          <Text style={[st.label, { color: t.muted }]}>Needed by</Text>
          <View style={st.chips}>
            {DUE.map(([label, d]) => (
              <Chip key={label} label={label} active={due === ymdPlus(d)} onPress={() => setDue(due === ymdPlus(d) ? null : ymdPlus(d))} />
            ))}
          </View>
          <Sub>{due ? `Due ${fmtDate(due)}` : 'No due date'}</Sub>
        </Card>

        <Card>
          <Text style={[st.label, { color: t.muted }]}>Items</Text>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Type code or name: TR 216, 10/14 Ovel…"
            placeholderTextColor={t.muted}
            autoCorrect={false}
            autoCapitalize="none"
            style={[st.input, { color: t.ink, backgroundColor: t.bg, borderColor: t.line }]}
          />
          {term ? (
            <View style={[st.results, { borderColor: t.line }]}>
              {(results.data ?? []).map((it) => (
                <Pressable key={it.id} onPress={() => add({ itemId: it.id, name: it.name, unit: it.unit })} style={({ pressed }) => [st.result, { borderBottomColor: t.line, backgroundColor: pressed ? t.accentSoft : t.surface }]}>
                  <Text style={{ color: t.ink, flex: 1 }}>{it.name}</Text>
                  <Text style={{ color: t.muted, fontFamily: 'monospace', fontSize: 12 }}>{it.unit}</Text>
                </Pressable>
              ))}
              {results.data && !results.data.length ? (
                <Pressable onPress={() => add({ name: search.trim(), unit: 'Pcs', custom: true })} style={[st.result, { backgroundColor: t.surface }]}>
                  <Text style={{ color: t.ink, flex: 1 }}>Not in the item list. Add "{search.trim()}" anyway</Text>
                </Pressable>
              ) : null}
              {results.isFetching && !results.data ? <Sub style={{ padding: 10 }}>Searching…</Sub> : null}
            </View>
          ) : null}

          {lines.length === 0 ? <Sub>No items yet. Search above and tap an item.</Sub> : null}
          {lines.map((l) => (
            <View key={l.key} style={[st.line, { backgroundColor: t.bg }]}>
              <Text style={{ color: t.ink, flex: 1 }}>
                {l.name}
                {l.custom ? <Text style={{ color: t.muted }}> (not in list)</Text> : null}
              </Text>
              <TextInput
                value={l.qty}
                onChangeText={(v) => setQty(l.key, v)}
                keyboardType="decimal-pad"
                placeholder="Qty"
                placeholderTextColor={t.muted}
                style={[st.qty, { color: t.ink, backgroundColor: t.surface, borderColor: t.line }]}
                accessibilityLabel={`Quantity for ${l.name}`}
              />
              <Text style={{ color: t.muted, fontFamily: 'monospace', fontSize: 12, width: 44 }}>{l.unit}</Text>
              <Pressable onPress={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} hitSlop={10} accessibilityLabel={`Remove ${l.name}`}>
                <Text style={{ color: t.muted, fontSize: 18 }}>✕</Text>
              </Pressable>
            </View>
          ))}
        </Card>

        <Card>
          <Field label="Note for the factory (optional)" value={note} onChangeText={setNote} placeholder="Colour, packing, urgent…" multiline />
        </Card>
        <ErrorNote message={err} />
        <Button big kind="primary" title="Save order" loading={create.isPending} onPress={save} />
        <Sub style={{ textAlign: 'center' }}>Next you'll send it to the factory from the order screen.</Sub>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  wrap: { padding: 16, gap: 14, paddingBottom: 60 },
  label: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  results: { borderWidth: 1, borderRadius: 10, overflow: 'hidden', maxHeight: 320 },
  result: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 12, borderBottomWidth: 1 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, padding: 8 },
  qty: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, width: 76, fontSize: 16, textAlign: 'right' },
});
