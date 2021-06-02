import * as mm from 'music-metadata';
import { IPicture } from 'music-metadata';

export const getImageFromID3 = async (
  musicPath: string,
): Promise<IPicture | undefined> => {
  const musicID3 = await mm.parseFile(musicPath);
  const pics = musicID3.common.picture;
  if (!pics || pics.length === 0) {
    return;
  }
  const pic = pics[0];
  return pic;
};
