const DEFAULT_PAGE_SIZE = 20;

// Returns one page of items from storage, oldest first.
export function listItems(storage, { page = 1, pageSize = DEFAULT_PAGE_SIZE } = {}) {
  const items = storage.list();
  const start = (page - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    page,
    pageSize,
    total: items.length,
  };
}
