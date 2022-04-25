import { ThumbnailGenerator } from './thumbnail.service';
import Jimp = require('jimp');

export class JimpThumbnailGenerator implements ThumbnailGenerator {
  async generate(buffer: Buffer, output: string): Promise<void> {
    const coverImage = await Jimp.read(buffer);
    await coverImage.resize(320, Jimp.AUTO, Jimp.RESIZE_BEZIER);
    await coverImage.write(output);
  }
}
