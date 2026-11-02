import { Redirect } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { HOME } from '@/components/RoleGate';
import { Button, ErrorNote, Field } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';

export default function Login() {
  const t = useTheme();
  const { user, login } = useAuth();
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Redirect href={HOME[user.role]} />;

  const submit = async () => {
    setErr(null);
    if (phone.replace(/\D/g, '').length < 10) return setErr('Enter your 10-digit mobile number.');
    if (!/^\d{4,6}$/.test(pin)) return setErr('Enter your 4 to 6 digit PIN.');
    setBusy(true);
    try {
      await login(phone, pin);
    } catch (e) {
      setErr((e as Error).message);
      setPin('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={st.wrap}>
        <View style={st.brandRow}>
          <View style={[st.dot, { backgroundColor: t.accent }]} />
          <View style={[st.dot, st.dot2, { backgroundColor: t.st.sent }]} />
          <View style={[st.dot, st.dot3, { backgroundColor: t.st.ready }]} />
        </View>
        <Text style={[st.title, { color: t.ink }]}>Bead Order Desk</Text>
        <Text style={{ color: t.muted, marginBottom: 24 }}>Log in with the mobile number and PIN the owner gave you.</Text>
        <View style={{ gap: 14 }}>
          <Field label="Mobile number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="98xxxxxxxx" autoComplete="tel" textContentType="telephoneNumber" />
          <Field label="PIN" value={pin} onChangeText={(v) => setPin(v.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" secureTextEntry placeholder="••••" onSubmitEditing={submit} />
          <ErrorNote message={err} />
          <Button big kind="primary" title="Log in" loading={busy} onPress={submit} />
          <Text style={{ color: t.muted, fontSize: 13, textAlign: 'center' }}>Forgot your PIN? Ask the owner to reset it.</Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center', paddingHorizontal: 24, maxWidth: 480, width: '100%', alignSelf: 'center' },
  brandRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, height: 18 },
  dot: { width: 18, height: 18, borderRadius: 9 },
  dot2: { width: 14, height: 14, marginLeft: -4 },
  dot3: { width: 10, height: 10, marginLeft: -3 },
  title: { fontSize: 28, fontWeight: '800', marginBottom: 6 },
});
