import { useColorScheme } from 'react-native';
import type { Status } from './types';

const light = {
  bg: '#F2F4F6',
  surface: '#FFFFFF',
  sunk: '#E8ECEF',
  ink: '#13202A',
  muted: '#566874',
  line: '#D6DDE3',
  accent: '#0D6B70',
  accentInk: '#FFFFFF',
  accentSoft: '#DDEFEF',
  warn: '#9A5B00',
  warnSoft: '#FBEFD9',
  crit: '#B0262C',
  critSoft: '#FBE3E3',
  wa: '#1F8F4E',
  waInk: '#FFFFFF',
  st: {
    created: '#6A7782',
    sent: '#B26A00',
    ack: '#2D63B8',
    production: '#7446B0',
    ready: '#1E7A3C',
    notified: '#0D6B70',
    delivered: '#4C5862',
    cancelled: '#9AA5AE',
  } as Record<Status, string>,
};

const dark: typeof light = {
  bg: '#0D1419',
  surface: '#152029',
  sunk: '#1B2833',
  ink: '#E4ECF1',
  muted: '#93A4B0',
  line: '#273541',
  accent: '#41B5AF',
  accentInk: '#06211F',
  accentSoft: '#163A3B',
  warn: '#E8A94A',
  warnSoft: '#3A2B12',
  crit: '#F0787C',
  critSoft: '#3E1C1F',
  wa: '#1F8F4E',
  waInk: '#FFFFFF',
  st: {
    created: '#93A4B0',
    sent: '#E8A94A',
    ack: '#7EA8F0',
    production: '#B493EA',
    ready: '#62C98A',
    notified: '#41B5AF',
    delivered: '#8A98A3',
    cancelled: '#5E6C77',
  },
};

export type Theme = typeof light;
export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}
