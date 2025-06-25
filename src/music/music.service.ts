import { HttpService, Injectable } from '@nestjs/common';
import { UpdateMusicDto } from './dto/update-music.dto';
import { In, DataSource } from 'typeorm';
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
import { v4 as uuidv4, v4 } from 'uuid';
import { getImageFromContentType } from '../utils/image';
import { ThumbnailService } from '../thumbnail/thumbnail.service';
import { Tag } from '../database/entites/tag';
import { StorageService } from '../storage/storage.service';
import { LogService } from '../log/log.service';
import { encodeImageToBlurhash } from '../utils/blurhash';
import * as db from 'mime-db';
import { getAverageColor } from 'fast-average-color-node';

export type MusicQueryFilter = {
  artistId: number;
  albumId: number;
  ids: string[];
  tags: string[];
  genre: string[];
  order: { [key: string]: 'ASC' | 'DESC' };
  uid: string;
  search: string;
  title: string;
  path: string;
  pathSearch: string;
  random: boolean;
  playlistIds: string[];
  albumSearch: string;
  artistSearch: string;
  withTags: boolean;
} & PageFilter;

@Injectable()
export class MusicService {
  constructor(
    private httpService: HttpService,
    private thumbnailService: ThumbnailService,
    private storageService: StorageService,
    private logService: LogService,
    private dataSource: DataSource,
  ) {}

  async findAll(filter: MusicQueryFilter) {
    const libraries = await MediaLibrary.getLibraryByUid(filter.uid, this.dataSource);
    const musicRepository = this.dataSource.getRepository(Music);
    const queryBuilder = musicRepository.createQueryBuilder('music');
    queryBuilder
      .take(filter.pageSize)
      .skip((filter.page - 1) * filter.pageSize);
    if (libraries.length > 0) {
      queryBuilder.where('music.libraryId in (:...lid)', {
        lid: libraries.map((it) => it.id),
      });
    }
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
    if (filter.playlistIds.length > 0 && filter.playlistIds[0] !== '') {
      queryBuilder.andWhere((qb) => {
        const subQuery = qb
          .subQuery()
          .select('music.id')
          .from(Music, 'music')
          .leftJoin('music.playlist', 'playlist')
          .where('playlist.id in (:...pid)', { pid: filter.playlistIds })
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
    if (filter.albumSearch.length > 0) {
      queryBuilder.andWhere('music.title like :title', {
        title: `%${filter.title}%`,
      });
    }
    if (filter.artistSearch.length > 0) {
      queryBuilder.andWhere('artist.name like :title', {
        title: `%${filter.artistSearch}%`,
      });
    }
    if (filter.pathSearch.length > 0) {
      queryBuilder.andWhere('music.path like :search', {
        search: `%${filter.pathSearch}%`,
      });
    }
    if (filter.title.length > 0) {
      queryBuilder.andWhere('music.title = :title', {
        title: filter.title,
      });
    }
    if (filter.path.length > 0) {
      queryBuilder.andWhere('music.path = :path', {
        path: filter.path,
      });
    }
    if (filter.tags.length > 0 && filter.tags[0] !== '') {
      queryBuilder
        .leftJoinAndSelect('music.tags', 'tag')
        .andWhere('tag.id in (:...tags)', { tags: filter.tags });
    }
    if (filter.genre.length > 0 && filter.genre[0] !== '') {
      queryBuilder
        .leftJoinAndSelect('music.genre', 'genre')
        .andWhere('genre.id in (:...genres)', { genres: filter.genre });
    }
    if (filter.random) {
      if (this.dataSource.options.type === 'sqlite') {
        queryBuilder.orderBy('RANDOM()');
      } else {
        queryBuilder.orderBy('RAND()');
      }
    } else {
      const order = {};
      Object.getOwnPropertyNames(filter.order).forEach((fieldName) => {
        order[`music.${fieldName}`] = filter.order[fieldName];
      });
      queryBuilder.orderBy(order);
    }
    queryBuilder
      .leftJoinAndSelect('music.album', 'album')
      .leftJoinAndSelect('music.artist', 'artist');
    if (filter.withTags) {
      queryBuilder.leftJoinAndSelect('music.tags', 'tag');
    }
    return queryBuilder.getManyAndCount();
  }

  async findOne(id: number, uid: string) {
    const libraries = await MediaLibrary.getLibraryByUid(uid, this.dataSource);
    const musicRepository = this.dataSource.getRepository(Music);
    let query = musicRepository.createQueryBuilder('music').whereInIds([id]);
    if (libraries.length > 0) {
      query = query.andWhere('music.libraryId in (:...lid)', {
        lid: libraries.map((it) => it.id),
      });
    }
    return await query.getOne();
  }

  async remove(id: number) {
    return await Music.deleteMusic(id, this.dataSource);
  }

  async updateMusicFile(id: number, uid: string, dto: UpdateMusicDto) {
    const repo = this.dataSource.getRepository(Music);
    const queryMusicStartTime = Date.now();
    const music = await repo.findOne({
      where: { id },
      relations: ['album', 'library'],
    });
    const queryMusicEndTime = Date.now();
    this.logService.info({
      content: `query music time: ${queryMusicEndTime - queryMusicStartTime}ms`,
    });
    if (music === undefined || music === null) {
      throw new Error('music not exist');
    }
    const tags: { [key: string]: string | number } = {};
    if (dto.title) {
      tags['title'] = dto.title;
      music.title = dto.title;
    }
    const updateArtistStartTime = Date.now();
    const artists: Artist[] = [];
    if (dto.artist) {
      for (const artistName of dto.artist) {
        const artist = await getOrCreateArtist(artistName, music.library, this.dataSource);
        artists.push(artist);
      }
      music.artist = artists;

      tags['artist'] = dto.artist.join(';');
    }
    const updateArtistEndTime = Date.now();
    this.logService.info({
      content: `update artist time: ${
        updateArtistEndTime - updateArtistStartTime
      }ms`,
    });
    let prevAlbum: Album;
    if (dto.album) {
      if (music.album) {
        prevAlbum = music.album;
      }
      const updateAlbumStartTime = Date.now();
      music.album = await getOrCreateAlbum(dto.album, music.library, this.dataSource);
      const updateAlbumEndTime = Date.now();
      this.logService.info({
        content: `update album time: ${
          updateAlbumEndTime - updateAlbumStartTime
        }`,
      });

      // generate cover
      if (music.album.cover === null || music.album.cover.length === 0) {
        let isExist = false;
        if (music.album?.cover) {
          isExist = await this.storageService.existCover(music.album.cover);
        }
        if (!isExist) {
          const meta = await mm.parseFile(music.path);
          const cover = meta.common.picture[0];
          const mime = db[cover.format];
          if (mime) {
            const ext = mime.extensions[0];
            const coverFilename = `${uuidv4()}.${ext}`;
            await this.thumbnailService.generate(cover.data, coverFilename);
            const hash = await encodeImageToBlurhash(cover.data);
            music.album.cover = coverFilename;
            music.album.blurHash = hash;
            // get domain color
            const color = await getAverageColor(cover.data);
            music.album.domainColor = color.hex;
            await this.dataSource.getRepository(Album).save(music.album);
          }
        }
        await this.dataSource.getRepository(Album).save(music.album);
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
        const genre = await Genre.createOrGet(genreName, music.library, this.dataSource);
        genres.push(genre);
      }
      music.genre = genres;
      tags['genre'] = dto.genre.join(';');
    }

    if (dto.disc) {
      tags['partOfSet'] = dto.disc;
    }
    const updateMusicStartTime = Date.now();
    const file = await fs.promises.readFile(music.path);
    const buf = await id3Promise.update(tags, file);
    await fs.promises.writeFile(music.path, buf);
    const updateMusicEndTime = Date.now();
    this.logService.info({
      content: `update music time: ${
        updateMusicEndTime - updateMusicStartTime
      }`,
    });
    await this.dataSource.getRepository(Music).save(music);
    // recycle old album
    if (prevAlbum) {
      const refreshArtistStartTime = Date.now();
      await prevAlbum.refreshArtist(this.dataSource);
      const refreshArtistEndTime = Date.now();
      this.logService.info({
        content: `refresh artist time: ${
          refreshArtistEndTime - refreshArtistStartTime
        }`,
      });
      const refreshGenreStartTime = Date.now();
      await Album.recycle(prevAlbum.id, this.dataSource);
      const refreshGenreEndTime = Date.now();
      this.logService.info({
        content: `refresh genre time: ${
          refreshGenreEndTime - refreshGenreStartTime
        }`,
      });
    }
    if (music.album) {
      await music.album.refreshArtist(this.dataSource);
    }
    if (dto.coverUrl) {
      await this.setMusicCoverFromUrl(music.id, dto.coverUrl);
    }
  }

  async updateMusicCover(id: number, coverfile: any) {
    const music = await this.dataSource.getRepository(Music).findOne({
      where: { id },
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
    if (music.album) {
      // save album cover
      const coverFilename = `${uuidv4()}.jpg`;
      await this.thumbnailService.generate(
        coverfile.buffer as any,
        coverFilename,
      );
      music.album.cover = coverFilename;
      await this.dataSource.getRepository(Album).save(music.album);
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
    const music = await this.dataSource.getRepository(Music).findOne({
      where: { id: musicId },
      relations: ['album'],
    });
    if (!music.album.cover) {
      const saveFilename = `${v4()}.${ext}`;

      const savePath = Path.join(ApplicationConfig.coverDir, saveFilename);
      await fs.promises.writeFile(savePath, imageBuf);
      music.album.cover = saveFilename;
      await this.dataSource.getRepository(Album).save(music.album);
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
    return music.save(this.dataSource);
  }

  async addMusicTags(names: string[], musicId: number, replace: boolean) {
    const music = await this.dataSource.getRepository(Music).findOne({
      where: { id: musicId },
      relations: ['library', 'tags'],
    });
    const tags = await this.dataSource.getRepository(Tag).find({
      where: {
        name: In(names),
      },
    });
    // get not exist tags
    const notExistTags = names.filter((name) => {
      return tags.find((tag) => tag.name === name) === undefined;
    });
    if (notExistTags.length !== 0) {
      const newTags = await this.dataSource.getRepository(Tag).save(
        notExistTags.map((name) => {
          return {
            name,
            library: music.library,
          };
        }),
      );
      tags.push(...newTags);
    }
    if (replace) {
      music.tags = tags;
    } else {
      music.tags = [...music.tags, ...tags];
    }
    await this.dataSource.getRepository(Music).save(music);
  }
}
