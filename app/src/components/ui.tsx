import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';
import { useTheme } from '@/lib/theme';
import { LABEL, STAGES, type Alert, type Status } from '@/lib/types';

type Kind = 'primary' | 'whatsapp' | 'plain' | 'ghost' | 'danger';

export function Button({
  title,
  onPress,
  kind = 'plain',
  big,
  disabled,
  loading,
  style,
}: {
  title: string;
  onPress: () => void;
  kind?: Kind;
  big?: boolean;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}) {
  const t = useTheme();
  const bg = { primary: t.accent, whatsapp: t.wa, plain: t.surface, ghost: 'transparent', danger: 'transparent' }[kind];
  const fg = { primary: t.accentInk, whatsapp: t.waInk, plain: t.ink, ghost: t.muted, danger: t.crit }[kind];
  const border = kind === 'plain' ? t.line : bg;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        s.btn,
        big && s.btnBig,
        { backgroundColor: bg, borderColor: border, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={[s.btnText, big && s.btnTextBig, { color: fg }]}>{title}</Text>}
    </Pressable>
  );
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  const t = useTheme();
  return (
    <View style={{ gap: 4 }}>
      <Text style={[s.label, { color: t.muted }]}>{label}</Text>
      <TextInput
        placeholderTextColor={t.muted}
        {...props}
        style={[s.input, { color: t.ink, backgroundColor: t.bg, borderColor: t.line }, props.style]}
      />
    </View>
  );
}

export function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      style={[s.chip, { borderColor: active ? t.ink : t.line, backgroundColor: active ? t.ink : t.surface }]}
    >
      <Text style={[s.chipText, { color: active ? t.surface : t.muted }]}>{label}</Text>
    </Pressable>
  );
}

export function Card({ children, danger, style }: { children: ReactNode; danger?: boolean; style?: ViewStyle }) {
  const t = useTheme();
  return <View style={[s.card, { backgroundColor: t.surface, borderColor: danger ? t.crit : t.line }, style]}>{children}</View>;
}

export function StatusPill({ status }: { status: Status }) {
  const t = useTheme();
  return (
    <View style={[s.pill, { backgroundColor: t.st[status] }]}>
      <Text style={[s.pillText, { color: t.surface }]}>{LABEL[status]}</Text>
    </View>
  );
}

/** Seven-step progress bar: taken → sent → confirmed → making → ready → told → delivered */
export function Rail({ status }: { status: Status }) {
  const t = useTheme();
  const i = STAGES.indexOf(status);
  return (
    <View style={s.rail} accessibilityLabel={`Step ${i + 1} of 7: ${LABEL[status]}`}>
      {STAGES.map((st, j) => (
        <View key={st} style={[s.railSeg, { backgroundColor: j === i ? t.st[status] : j < i ? t.muted : t.sunk, opacity: j < i ? 0.5 : 1 }]} />
      ))}
    </View>
  );
}

export function Alerts({ alerts }: { alerts: Alert[] }) {
  const t = useTheme();
  if (!alerts.length) return null;
  return (
    <View style={{ gap: 4 }}>
      {alerts.map((a) => (
        <Text key={a.type} style={[s.alert, { backgroundColor: a.level === 'crit' ? t.critSoft : t.warnSoft, color: a.level === 'crit' ? t.crit : t.warn }]}>
          {a.text}
        </Text>
      ))}
    </View>
  );
}

export function Empty({ title, body }: { title: string; body?: string }) {
  const t = useTheme();
  return (
    <View style={[s.empty, { borderColor: t.line, backgroundColor: t.surface }]}>
      <Text style={[s.emptyTitle, { color: t.ink }]}>{title}</Text>
      {body ? <Text style={{ color: t.muted, textAlign: 'center' }}>{body}</Text> : null}
    </View>
  );
}

export function ErrorNote({ message }: { message?: string | null }) {
  const t = useTheme();
  if (!message) return null;
  return <Text style={[s.alert, { backgroundColor: t.critSoft, color: t.crit }]}>{message}</Text>;
}

export function H1({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <Text style={[s.h1, { color: t.ink }]}>{children}</Text>;
}
export function Sub({ children, style }: { children: ReactNode; style?: object }) {
  const t = useTheme();
  return <Text style={[{ color: t.muted, fontSize: 13 }, style]}>{children}</Text>;
}

export const s = StyleSheet.create({
  btn: { borderWidth: 1, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', minHeight: 44 },
  btnBig: { paddingVertical: 14, paddingHorizontal: 18, minHeight: 52 },
  btnText: { fontWeight: '700', fontSize: 14 },
  btnTextBig: { fontSize: 16 },
  label: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  chip: { borderWidth: 1, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 14 },
  chipText: { fontWeight: '700', fontSize: 13 },
  card: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 10 },
  pill: { borderRadius: 999, paddingVertical: 3, paddingHorizontal: 10, alignSelf: 'flex-start' },
  pillText: { fontSize: 12, fontWeight: '700' },
  rail: { flexDirection: 'row', gap: 3 },
  railSeg: { flex: 1, height: 5, borderRadius: 3 },
  alert: { fontSize: 13, fontWeight: '700', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, overflow: 'hidden' },
  empty: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 12, padding: 28, alignItems: 'center', gap: 4 },
  emptyTitle: { fontSize: 17, fontWeight: '700' },
  h1: { fontSize: 22, fontWeight: '700' },
});
