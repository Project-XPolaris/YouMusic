import Jimp = require('jimp');
const { encode } = require('blurhash');

export const encodeImageToBlurhash = async (buffer): Promise<string> => {
  const image = await Jimp.read(buffer);
  image.resize(32, 32, Jimp.RESIZE_BEZIER);
  const { data, width, height } = image.bitmap;
  return encode(new Uint8ClampedArray(data), width, height, 4, 4);
};
