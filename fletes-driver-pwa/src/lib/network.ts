export const getNetworkProfile = () => {
  if (typeof navigator === 'undefined') {
    return { saveData: false, effectiveType: undefined };
  }
  const connection = (navigator as { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  const effectiveType = connection?.effectiveType;
  const saveData = Boolean(connection?.saveData || (effectiveType && ['slow-2g', '2g'].includes(effectiveType)));
  return { saveData, effectiveType };
};
