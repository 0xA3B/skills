// In-memory storage. Every consumer sees the full read and write surface.
export function createMemoryStorage() {
  const items = new Map();

  return {
    get(id) {
      return items.get(id);
    },
    list() {
      return [...items.values()];
    },
    set(id, value) {
      items.set(id, value);
    },
    delete(id) {
      return items.delete(id);
    },
  };
}
