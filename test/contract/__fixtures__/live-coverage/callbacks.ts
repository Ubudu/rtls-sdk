export function mapIds(items: { id: string }[]): { id: string }[] {
  return items.map((i) => ({ id: i.id }));
}
