import * as dayjs from 'dayjs';

export const formatDate = (date: Date): string => {
  return dayjs(date).format('YYYY-MM-DD hh:mm:ss');
};
