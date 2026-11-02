import { useState } from 'react';
import { Alert, Platform, Text, View } from 'react-native';
import { useAuth } from '@/lib/auth';
import { ago } from '@/lib/format';
import { useMessageAction, useSetStatus } from '@/lib/orders';
import { useTheme } from '@/lib/theme';
import { VIA_LABEL, type Order, type Status } from '@/lib/types';
import { Button, ErrorNote } from './ui';

function confirm(title: string, message: string, onYes: () => void) {
  if (Platform.OS === 'web') {
    // eslint-disable-next-line no-alert
    if (globalThis.confirm?.(`${title}\n\n${message}`)) onYes();
    return;
  }
  Alert.alert(title, message, [
    { text: 'No', style: 'cancel' },
    { text: 'Yes', style: 'destructive', onPress: onYes },
  ]);
}

const FACTORY_NEXT: Partial<Record<Status, [Status, string]>> = {
  sent: ['ack', 'I received this order'],
  ack: ['production', 'Started making'],
  production: ['ready', 'Order is ready'],
};

/** The buttons each person sees depend on their role and the order's stage. */
export function OrderActions({ order: o }: { order: Order }) {
  const t = useTheme();
  const { user, whatsappApi } = useAuth();
  const send = useMessageAction('send');
  const notify = useMessageAction('notify');
  const setStatus = useSetStatus();
  const [err, setErr] = useState<string | null>(null);
  const busy = send.isPending || notify.isPending || setStatus.isPending;
  const run = (p: Promise<unknown>) => {
    setErr(null);
    p.catch((e: Error) => setErr(e.message));
  };
  if (!user) return null;
  const role = user.role;

  if (role === 'factory') {
    const next = FACTORY_NEXT[o.status];
    if (!next) return null;
    return (
      <View style={{ gap: 8 }}>
        <Button big kind="primary" title={next[1]} loading={setStatus.isPending} onPress={() => run(setStatus.mutateAsync({ id: o.id, to: next[0] }))} />
        <ErrorNote message={err} />
      </View>
    );
  }

  const sentEv = [...o.events].reverse().find((e) => e.status === 'sent');
  const canCancel = ['created', 'sent', 'ack', 'production', 'ready'].includes(o.status);

  return (
    <View style={{ gap: 8 }}>
      {o.status === 'created' && (
        <View style={{ gap: 8 }}>
          <Button
            kind="whatsapp"
            title={whatsappApi ? 'Send to factory on WhatsApp' : 'Open WhatsApp to send to factory'}
            loading={send.isPending}
            disabled={busy}
            onPress={() => run(send.mutateAsync({ id: o.id, method: 'whatsapp' }))}
          />
          <Button title="I gave it to the factory by phone" disabled={busy} onPress={() => run(send.mutateAsync({ id: o.id, method: 'phone' }))} />
        </View>
      )}
      {['sent', 'ack', 'production'].includes(o.status) && (
        <Text style={{ color: t.muted, fontStyle: 'italic', fontSize: 13 }}>
          Waiting for the factory. Sent {sentEv ? ago(sentEv.at) : ''}
          {sentEv && VIA_LABEL[sentEv.via] ? ` (${VIA_LABEL[sentEv.via]})` : ''}
          {o.factory_msg_status ? ` · WhatsApp message ${o.factory_msg_status}` : ''}.
        </Text>
      )}
      {o.status === 'ready' && (
        <View style={{ gap: 8 }}>
          <Button
            kind="whatsapp"
            title={whatsappApi ? 'Send "ready" message to customer' : 'Tell customer on WhatsApp'}
            loading={notify.isPending}
            disabled={busy || (whatsappApi && !o.customer_phone)}
            onPress={() => run(notify.mutateAsync({ id: o.id, method: 'whatsapp' }))}
          />
          <Button title="I told them by phone" disabled={busy} onPress={() => run(notify.mutateAsync({ id: o.id, method: 'phone' }))} />
        </View>
      )}
      {(o.status === 'notified' || o.status === 'ready') && (
        <Button
          kind={o.status === 'notified' ? 'primary' : 'plain'}
          title="Mark delivered / picked up"
          disabled={busy}
          onPress={() => run(setStatus.mutateAsync({ id: o.id, to: 'delivered' }))}
        />
      )}
      {role === 'owner' && ['sent', 'ack', 'production'].includes(o.status) && (
        <Button
          kind="ghost"
          title="Factory told me it's ready"
          disabled={busy}
          onPress={() => confirm('Mark as ready?', 'Only do this if the factory told you directly.', () => run(setStatus.mutateAsync({ id: o.id, to: 'ready', via: 'phone' })))}
        />
      )}
      {canCancel && (
        <Button
          kind="danger"
          title="Cancel order"
          disabled={busy}
          onPress={() => confirm(`Cancel ${o.code}?`, 'The factory and owner will be told.', () => run(setStatus.mutateAsync({ id: o.id, to: 'cancelled' })))}
        />
      )}
      <ErrorNote message={err} />
    </View>
  );
}
