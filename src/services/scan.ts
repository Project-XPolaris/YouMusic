import * as fs from 'fs';
import * as path from 'path';
import { MediaLibrary } from '../database/entites/library';
import { getRepository } from 'typeorm';
import { Music } from '../database/entites/music';

interface ScannerOption {
  extension: string[];
}
export const scanFile = async (
  filePath: string,
  option: ScannerOption = { extension: ['.mp3'] },
): Promise<string[]> => {
  const scanQueue = [filePath];
  const result = [];
  while (scanQueue.length !== 0) {
    const currentDirPath = scanQueue.shift();
    const items = await fs.promises.readdir(currentDirPath, {
      withFileTypes: true,
    });
    for (const item of items) {
      if (item.isDirectory()) {
        scanQueue.push(path.join(currentDirPath, item.name));
        continue;
      }
      if (item.isFile()) {
        const ext = path.extname(item.name);
        if (option.extension.find((it) => it === ext)) {
          result.push(path.join(currentDirPath, item.name));
        }
      }
    }
  }
  return result;
};
export const syncLibrary = async (library: MediaLibrary) => {
  const libraryRepo = await getRepository(MediaLibrary);
  const syncLibrary = await libraryRepo.findOne(library.id, {
    relations: ['music'],
  });
  if (syncLibrary === undefined) {
    return;
  }
  for (const music of syncLibrary.music) {
    try {
      await fs.promises.stat(music.path);
    } catch (e) {
      Music.deleteMusic(music.id);
    }
  }
};
