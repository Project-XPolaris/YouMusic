export const stringToBase64 = (data: string): string => {
  const buff = new Buffer(data);
  return buff.toString('base64');
};
export const replaceExt = (pathString: string, newExt: string) => {
  return pathString.substr(0, pathString.lastIndexOf('.')) + newExt;
};
