import { ThumbnailGenerator } from './thumbnail.service';
import Jimp = require('jimp');

export class JimpThumbnailGenerator implements ThumbnailGenerator {
  async generate(buffer: Buffer): Promise<Buffer> {
    const coverImage = await Jimp.read(buffer);
    await coverImage.resize(320, Jimp.AUTO, Jimp.RESIZE_BEZIER);
    return new Promise((resolve, reject) => {
      coverImage.getBuffer(coverImage.getMIME(), (err, buffer) => {
        if (err) {
          reject(err);
        }
        resolve(buffer);
      });
    });
  }
}
