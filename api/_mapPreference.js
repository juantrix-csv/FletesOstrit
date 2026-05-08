const FALSE_VALUES = new Set(['0', 'false', 'no', 'off']);

export const preferOpenMaps = () => {
  const rawValue = process.env.PREFER_OPEN_MAPS;
  if (typeof rawValue !== 'string') return true;
  return !FALSE_VALUES.has(rawValue.trim().toLowerCase());
};
