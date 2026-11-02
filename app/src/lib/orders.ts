import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Linking } from 'react-native';
import { api } from './api';
import type { Order, Status } from './types';

/** Refresh every 15 s while the screen is open, plus on app focus and pull-to-refresh. */
export function useOrders(scope: 'open' | 'done' | 'all', search = '') {
  return useQuery({
    queryKey: ['orders', scope, search],
    queryFn: () => api<{ orders: Order[]; whatsappApi: boolean }>(`/orders?scope=${scope}&q=${encodeURIComponent(search)}`),
    refetchInterval: 15_000,
  });
}

export function useOrder(id: string) {
  return useQuery({
    queryKey: ['order', id],
    queryFn: () => api<{ order: Order }>(`/orders/${id}`).then((r) => r.order),
    refetchInterval: 15_000,
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return (o?: Order) => {
    qc.invalidateQueries({ queryKey: ['orders'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
    if (o) qc.setQueryData(['order', o.id], o);
  };
}

type SendResult = { mode: 'api' | 'link' | 'phone'; url?: string; order: Order };

/** Send to factory / tell customer. In link mode the app opens WhatsApp with the message ready. */
export function useMessageAction(kind: 'send' | 'notify') {
  const done = useInvalidate();
  return useMutation({
    mutationFn: async ({ id, method }: { id: string; method: 'whatsapp' | 'phone' }) => {
      const r = await api<SendResult>(`/orders/${id}/${kind}`, { method: 'POST', body: { method } });
      if (r.mode === 'link' && r.url) await Linking.openURL(r.url).catch(() => {});
      return r;
    },
    onSuccess: (r) => done(r.order),
  });
}

export function useSetStatus() {
  const done = useInvalidate();
  return useMutation({
    mutationFn: ({ id, to, via }: { id: string; to: Status; via?: 'app' | 'phone' | 'in_person' }) =>
      api<{ order: Order }>(`/orders/${id}/status`, { method: 'POST', body: { to, via: via ?? 'app' } }).then((r) => r.order),
    onSuccess: (o) => done(o),
  });
}

export function useCreateOrder() {
  const done = useInvalidate();
  return useMutation({
    mutationFn: (body: { customerName: string; customerPhone: string; dueDate: string | null; note: string; items: { itemId?: number; name?: string; qty: number }[] }) =>
      api<{ order: Order }>('/orders', { method: 'POST', body }).then((r) => r.order),
    onSuccess: (o) => done(o),
  });
}
