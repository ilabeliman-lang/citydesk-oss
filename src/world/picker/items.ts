export type PickerItem = {
  id: string;
  name: string;
};

/** The item whose id matches, or null when that id is not in the list. */
export function pickItem<T extends { id: string }>(items: readonly T[], id: string): T | null {
  for (const item of items) {
    if (item.id === id) return item;
  }
  return null;
}
