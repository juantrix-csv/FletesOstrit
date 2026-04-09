export type DriverColors = {
  background: string;
  border: string;
  text: string;
  accent: string;
};

const DRIVER_COLOR_PALETTE: DriverColors[] = [
  { background: '#DBEAFE', border: '#60A5FA', text: '#1E3A8A', accent: '#1D4ED8' },
  { background: '#DCFCE7', border: '#4ADE80', text: '#14532D', accent: '#15803D' },
  { background: '#FEF3C7', border: '#F59E0B', text: '#92400E', accent: '#D97706' },
  { background: '#FCE7F3', border: '#F472B6', text: '#9D174D', accent: '#DB2777' },
  { background: '#E0F2FE', border: '#38BDF8', text: '#075985', accent: '#0284C7' },
  { background: '#FFEDD5', border: '#FDBA74', text: '#9A3412', accent: '#EA580C' },
  { background: '#ECFCCB', border: '#A3E635', text: '#3F6212', accent: '#65A30D' },
  { background: '#FFE4E6', border: '#FB7185', text: '#9F1239', accent: '#E11D48' },
];

const DEFAULT_DRIVER_COLORS: DriverColors = {
  background: '#F3F4F6',
  border: '#D1D5DB',
  text: '#374151',
  accent: '#6B7280',
};

const hashString = (value: string) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
};

export const getDriverColors = (driverId?: string | null): DriverColors => {
  if (!driverId) return DEFAULT_DRIVER_COLORS;
  const index = hashString(driverId) % DRIVER_COLOR_PALETTE.length;
  return DRIVER_COLOR_PALETTE[index] ?? DEFAULT_DRIVER_COLORS;
};
