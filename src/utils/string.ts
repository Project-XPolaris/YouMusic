export const stringToBase64 = (data: string): string => {
  const buff = new Buffer(data);
  return buff.toString('base64');
};
