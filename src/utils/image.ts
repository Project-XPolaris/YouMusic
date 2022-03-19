import * as db from 'mime-db';
import path from 'path';
import { ApplicationConfig } from '../config';
import Jimp = require('jimp');

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

export const makeThumbnail = async (input: Buffer, output: string) => {
  let coverImage = await Jimp.read(input);
  coverImage = coverImage.resize(512, Jimp.AUTO, Jimp.RESIZE_BEZIER);
  coverImage.write(output);
};
