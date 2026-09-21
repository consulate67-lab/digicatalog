/**
 * Paginated response helper. Frontend'in bekledigi `{data, pagination}` formatinda
 * response olusturur. Service'ler `{items, total, page, limit}` doner, route
 * handler bu helper ile shape eder.
 *
 * NOT: Onceki service kontrati `{items, total}` idi — bu helper'i kullanmak
 * icin service'lere page + limit field'lari eklendi (clamp edilmis hali).
 */
export interface PaginatedEnvelope<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export const paginated = <T>(
  items: T[],
  total: number,
  page: number,
  limit: number,
): PaginatedEnvelope<T> => ({
  data: items,
  pagination: {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  },
});