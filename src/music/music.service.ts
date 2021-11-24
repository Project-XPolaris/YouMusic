import { HttpService, Injectable } from '@nestjs/common';
import { UpdateMusicDto } from './dto/update-music.dto';
import { getRepository } from 'typeorm';
import { Music } from 'src/database/entites/music';
import { PageFilter } from '../database/utils/type.filter';
import { MediaLibrary } from '../database/entites/library';
import * as fs from 'fs';
import { Promise as id3Promise } from 'node-id3';
import { Artist } from '../database/entites/artist';
import {
  getOrCreateAlbum,
  getOrCreateArtist,
  saveMusicCoverFile,
} from '../services/music';
import { Album } from '../database/entites/album';
import * as mm from 'music-metadata';
import * as path from 'path';
import * as Path from 'path';
import { Genre } from '../database/entites/genre';
import { ApplicationConfig } from '../config';
import { v4 } from 'uuid';
import { getImageFromContentType } from '../utils/image';

export type MusicQueryFilter = {
  artistId: number;
  albumId: number;
  ids: string[];
  order: { [key: string]: 'ASC' | 'DESC' };
  uid: string;
  search: string;
} & PageFilter;

@Injectable()
export class MusicService {
  constructor(private httpService: HttpService) {}

  async findAll(filter: MusicQueryFilter) {
    const libraries = await MediaLibrary.getLibraryByUid(filter.uid);
    const musicRepository = getRepository(Music);
    const queryBuilder = musicRepository.createQueryBuilder('music');
    queryBuilder
      .take(filter.pageSize)
      .skip((filter.page - 1) * filter.pageSize);
    queryBuilder.where('music.libraryId in (:...lid)', {
      lid: libraries.map((it) => it.id),
    });
    if (filter.albumId > 0) {
      queryBuilder.andWhere((qb) => {
        const subQuery = qb
          .subQuery()
          .select('music.id')
          .from(Album, 'album')
          .leftJoin('album.music', 'music')
          .where('album.id = :aid', { aid: filter.albumId })
          .getQuery();
        return 'music.id IN ' + subQuery;
      });
    }
    if (filter.artistId > 0) {
      queryBuilder.andWhere((qb) => {
        const subQuery = qb
          .subQuery()
          .select('music.id')
          .from(Artist, 'artist')
          .leftJoin('artist.music', 'music')
          .where('artist.id = :aid', { aid: filter.artistId })
          .getQuery();
        return 'music.id IN ' + subQuery;
      });
    }

    if (filter.ids.length > 0 && filter.ids[0] !== '') {
      queryBuilder.andWhere('music.id IN (:...ids)', { ids: filter.ids });
    }
    if (filter.search.length > 0) {
      queryBuilder.andWhere('music.title like :search', {
        search: `%${filter.search}%`,
      });
    }
    const order = {};
    Object.getOwnPropertyNames(filter.order).forEach((fieldName) => {
      order[`music.${fieldName}`] = filter.order[fieldName];
    });
    queryBuilder
      .leftJoinAndSelect('music.album', 'album')
      .leftJoinAndSelect('music.artist', 'artist');
    queryBuilder.orderBy(order);
    return queryBuilder.getManyAndCount();
  }

  async findOne(id: number, uid: string) {
    const libraries = await MediaLibrary.getLibraryByUid(uid);
    const musicRepository = getRepository(Music);
    return await musicRepository
      .createQueryBuilder('music')
      .whereInIds([id])
      .andWhere('music.libraryId in (:...lid)', {
        lid: libraries.map((it) => it.id),
      })
      .getOne();
  }

  async remove(id: number) {
    return await Music.deleteMusic(id);
  }

  async updateMusicFile(id: number, uid: string, dto: UpdateMusicDto) {
    const repo = await getRepository(Music);
    const music = await repo.findOne(id, { relations: ['album', 'library'] });
    if (music === undefined || music === null) {
      throw new Error('music not exist');
    }
    const tags: { [key: string]: string | number } = {};
    if (dto.title) {
      tags['title'] = dto.title;
      music.title = dto.title;
    }
    const artists: Artist[] = [];
    if (dto.artist) {
      for (const artistName of dto.artist) {
        const artist = await getOrCreateArtist(artistName, music.library);
        if (
          (artist.avatar === null || artist.avatar.length === 0) &&
          music.album.cover
        ) {
          // get copy of album
          artist.avatar = await music.album.duplicateCover();
          await getRepository(Artist).save(artist);
        }
        artists.push(artist);
      }
      music.artist = artists;

      tags['artist'] = dto.artist.join(';');
    }
    let prevAlbum: Album;
    if (dto.album) {
      if (music.album) {
        prevAlbum = music.album;
      }
      music.album = await getOrCreateAlbum(dto.album, music.library);
      // generate cover
      if (music.album.cover === null || music.album.cover.length === 0) {
        const meta = await mm.parseFile(music.path);
        music.album.cover = await saveMusicCoverFile(meta);
        await getRepository(Album).save(music.album);
      }
      tags['album'] = dto.album;
    }
    if (dto.year) {
      tags['year'] = dto.year;
      music.year = dto.year;
    }

    if (dto.track) {
      tags['trackNumber'] = dto.track;
      music.track = dto.track;
    }

    if (dto.genre) {
      const genres: Genre[] = [];
      for (const genreName of dto.genre) {
        const genre = await Genre.createOrGet(genreName, music.library);
        genres.push(genre);
      }
      music.genre = genres;
      tags['genre'] = dto.genre.join(';');
    }

    if (dto.disc) {
      tags['partOfSet'] = dto.disc;
    }
    const file = await fs.promises.readFile(music.path);
    const buf = await id3Promise.update(tags, file);
    await fs.promises.writeFile(music.path, buf);
    await getRepository(Music).save(music);
    // recycle old album
    if (prevAlbum) {
      await prevAlbum.refreshArtist();
      await Album.recycle(prevAlbum.id);
    }
    await music.album.refreshArtist();
    if (dto.coverUrl) {
      await this.setMusicCoverFromUrl(music.id, dto.coverUrl);
    }
  }

  async updateMusicCover(id: number, coverfile: any) {
    const music = await getRepository(Music).findOne(id, {
      relations: ['album', 'album.music'],
    });
    if (music === undefined || music === null) {
      throw new Error('music not exist');
    }
    const mime = path.extname(coverfile.originalname).replace('.', '');
    const tags = {
      image: {
        mime,
        type: {
          id: 3,
          name: 'front cover',
        },
        description: 'cover',
        imageBuffer: coverfile.buffer,
      },
    };
    const file = await fs.promises.readFile(music.path);
    const buf = await id3Promise.update(tags, file);
    await fs.promises.writeFile(music.path, buf);

    if (
      music.album &&
      (music.album.cover === undefined ||
        music.album.cover === null ||
        music.album.music.length === 1)
    ) {
      // save album cover
      await music.album.setCover(coverfile.buffer);
      await getRepository(Album).save(music.album);
    }
  }

  async setMusicCoverFromUrl(musicId: number, url: string) {
    const response = await this.httpService
      .request({
        url,
        method: 'GET',
        responseType: 'arraybuffer',
      })
      .toPromise();
    const imageBuf = Buffer.from(response.data, 'binary');

    const ext = getImageFromContentType(response.headers['content-type']);
    if (!ext) {
      return;
    }
    const music = await getRepository(Music).findOne(musicId, {
      relations: ['album'],
    });
    if (!music.album.cover) {
      const saveFilename = `${v4()}.${ext}`;
      const savePath = Path.join(ApplicationConfig.coverDir, saveFilename);
      await fs.promises.writeFile(savePath, imageBuf);
      music.album.cover = saveFilename;
      await getRepository(Album).save(music.album);
    }
    const tags = {
      image: {
        mime: response.headers['content-type'],
        type: {
          id: 3,
          name: 'front cover',
        },
        description: 'cover',
        imageBuffer: imageBuf,
      },
    };
    const file = await fs.promises.readFile(music.path);
    const buf = await id3Promise.update(tags, file);
    await fs.promises.writeFile(music.path, buf);
  }

  async updateLyric(id: number, uid: string, content: string): Promise<Music> {
    const music = await this.findOne(id, uid);
    if (!music) {
      return;
    }
    if (music.lyric && music.lyric.length !== 0 && fs.existsSync(music.lyric)) {
      await fs.promises.unlink(music.lyric);
    }
    const lrcFilePath = path.join(
      path.dirname(music.path),
      `${music.title}.lrc`,
    );
    await fs.promises.writeFile(lrcFilePath, content);
    music.lyric = lrcFilePath;
    return music.save();
  }
}
