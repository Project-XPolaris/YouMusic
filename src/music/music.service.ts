import { HttpService, Injectable } from '@nestjs/common';
import { UpdateMusicDto } from './dto/update-music.dto';
import { getRepository, ILike, In, Raw } from 'typeorm';
import { Music } from 'src/database/entites/music';
import { PageFilter } from '../database/utils/type.filter';
import { filterByPage } from '../database/utils/page.filter';
import { publicUid } from '../vars';
import { MediaLibrary } from '../database/entites/library';
import * as fs from 'fs';
import { Promise as id3Promise } from 'node-id3';
import { Artist } from '../database/entites/artist';
import {
  getOrCreateAlbum,
  getOrCreateArtist,
  saveMusicCoverFile,
} from '../services/music';
import { User } from '../database/entites/user';
import { Album } from '../database/entites/album';
import * as mm from 'music-metadata';
import * as path from 'path';
import * as Path from 'path';
import { Genre } from '../database/entites/genre';
import { ApplicationConfig } from '../config';
import { v4 } from 'uuid';
import * as db from 'mime-db';
import { uniq } from 'lodash';

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
    const musicRepository = getRepository(Music);
    // let queryBuilder = musicRepository.createQueryBuilder('music');
    const where: any = {};
    if (filter.albumId > 0) {
      where.album = {
        id: filter.albumId,
      };
    }
    if (filter.artistId > 0) {
      const artist = await getRepository(Artist).findOne(filter.artistId, {
        relations: ['music'],
      });
      if (artist) {
        where.id = In(artist.music.map((it) => it.id));
      }
    }

    if (filter.ids.length > 0 && filter.ids[0] !== '') {
      where.id = In(filter.ids);
    }
    if (filter.search.length > 0) {
      where.title = ILike(`%${filter.search}%`);
    }
    const order = {};
    Object.getOwnPropertyNames(filter.order).forEach((fieldName) => {
      order[`${fieldName}`] = filter.order[fieldName];
    });
    return musicRepository.findAndCount({
      take: filter.pageSize,
      skip: (filter.page - 1) * filter.pageSize,
      order: filter.order,
      where: where,
      relations: ['album', 'artist'],
    });
  }

  async findOne(id: number, uid: string) {
    const musicRepository = getRepository(Music);
    return await musicRepository
      .createQueryBuilder('music')
      .leftJoin('music.users', 'users')
      .whereInIds([id])
      .andWhere('users.uid in (:...uid)', { uid: [publicUid, uid] })
      .getOne();
  }

  async remove(id: number) {
    return await Music.deleteMusic(id);
  }

  async checkRemoveAccessible(id: number, uid: string) {
    const repo = await getRepository(Music);
    const count = await repo
      .createQueryBuilder('music')
      .leftJoinAndSelect(
        MediaLibrary,
        'library',
        'music.libraryId = library.id',
      )
      .leftJoin('library.users', 'users')
      .where('users.uid in (:...uid)', { uid: [publicUid, uid] })
      .where('music.id = :id', { id })
      .getCount();
    return count > 0;
  }

  async updateMusicFile(id: number, uid: string, dto: UpdateMusicDto) {
    const repo = await getRepository(Music);
    const music = await repo.findOne(id, { relations: ['album'] });
    if (music === undefined || music === null) {
      throw new Error('music not exist');
    }
    const user = await getRepository(User).findOne({ uid });
    const tags: { [key: string]: string | number } = {};
    if (dto.title) {
      tags['title'] = dto.title;
      music.title = dto.title;
    }
    const artists: Artist[] = [];
    if (dto.artist) {
      for (const artistName of dto.artist) {
        const artist = await getOrCreateArtist(artistName, user);
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
      music.album = await getOrCreateAlbum(dto.album, user);
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
        const genre = await Genre.createOrGet(genreName, user);
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
    const mime = db[response.headers['content-type']].extensions[0];
    const music = await getRepository(Music).findOne(musicId, {
      relations: ['album'],
    });
    if (!music.album.cover) {
      const saveFilename = `${v4()}.${
        db[response.headers['content-type']].extensions[0]
      }`;
      const savePath = Path.join(ApplicationConfig.coverDir, saveFilename);
      await fs.promises.writeFile(savePath, imageBuf);
      music.album.cover = saveFilename;
      await getRepository(Album).save(music.album);
    }
    const tags = {
      image: {
        mime,
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
}
