import { SelectQueryBuilder } from 'typeorm';

export const filterByPage = <T>(
  filter: { page?: number; pageSize?: number } | undefined = {
    page: 1,
    pageSize: 20,
  },
  queryBuilder: SelectQueryBuilder<T>,
) => {
  const { page = 1, pageSize = 20 } = filter;
  return queryBuilder
    .offset((Number(page) - 1) * Number(pageSize))
    .limit(Number(pageSize));
};
