import * as db from 'mime-db';

export const getImageFromContentType = (
  contentType: string,
): string | undefined => {
  switch (contentType) {
    case 'image/jpg':
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    default:
      const content = db[contentType];
      if (content && content.extensions.length > 0) {
        return content.extensions[0];
      }
  }
};
