export function fmtDur(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h`;
  return `${Math.round(h / 24)} days`;
}

export const ago = (iso: string) => {
  const d = fmtDur(Date.now() - new Date(iso).getTime());
  return d === 'just now' ? d : `${d} ago`;
};

export function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

export function fmtDate(ymd: string | null): string {
  if (!ymd) return '';
  return new Date(`${ymd}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export function ymdPlus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 919876543210 -> +91 98765 43210 */
export function fmtPhone(p: string): string {
  if (/^91\d{10}$/.test(p)) return `+91 ${p.slice(2, 7)} ${p.slice(7)}`;
  return p ? `+${p}` : '';
}
