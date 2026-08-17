/** Shared pagination for the public API (analysis v03 §4: page/pageSize). */

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

/** Parse page/pageSize from search params with sane clamping. */
export function parsePageParams(
  searchParams: URLSearchParams,
  defaultPageSize = DEFAULT_PAGE_SIZE
): { page: number; pageSize: number; skip: number; take: number } {
  const page = Math.max(1, Number.parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const rawSize =
    Number.parseInt(searchParams.get("pageSize") ?? String(defaultPageSize), 10) ||
    defaultPageSize;
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, rawSize));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export function pageMeta(page: number, pageSize: number, total: number): PageMeta {
  return {
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}
