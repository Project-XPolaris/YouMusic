export const getOrderFromQueryString = (
  queryString: string,
  {
    allowField,
  }: {
    allowField?: string[];
  },
): { [key: string]: 'ASC' | 'DESC' } => {
  if (queryString === '') {
    return {};
  }
  const parts = queryString.split(',');
  const result: { [key: string]: 'ASC' | 'DESC' } = {};
  parts.forEach((it) => {
    if (it.startsWith('-')) {
      const fieldName = it.substring(1, it.length);
      if (allowField) {
        if (allowField.find((it) => it === fieldName)) {
          result[fieldName] = 'DESC';
        }
      } else {
        result[fieldName] = 'DESC';
      }
    } else {
      if (allowField) {
        if (allowField.find((field) => field === it)) {
          result[it] = 'ASC';
        }
      } else {
        result[it] = 'ASC';
      }
    }
  });
  return result;
};
