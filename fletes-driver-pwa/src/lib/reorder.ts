export const reorderList = <T>(items: T[], fromIndex: number, toIndex: number): T[] => {
  if (fromIndex === toIndex) return [...items];
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
};
