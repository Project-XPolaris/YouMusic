import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Artist } from '../database/entites/artist';
import { User } from '../database/entites/user';
import { ArtistService } from '../artist/artist.service';
import { AlbumService } from '../album/album.service';
import { Album } from '../database/entites/album';
import { TagService } from '../tag/tag.service';
import { Tag } from '../database/entites/tag';
import { GenreService } from '../genre/genre.service';
import { Genre } from '../database/entites/genre';

@Injectable()
export class FavoriteService {
  constructor(
    private artistService: ArtistService,
    private albumService: AlbumService,
    private tagService: TagService,
    private genreService: GenreService,
    private dataSource: DataSource
  ) {}

  async addArtistToFavourite(artistId: number, uid: string): Promise<void> {
    const canAccess = await this.artistService.checkAccessible(artistId, uid);
    if (!canAccess) {
      throw new Error('You can not access this artist');
    }
    const userRepo = await this.dataSource.getRepository(User);
    const user = await userRepo.findOne({
      where: { uid },
    });
    const artistRepo = await this.dataSource.getRepository(Artist);
    const artist = await artistRepo.findOne({
      where: { id: artistId },
      relations: ['follow'],
    });
    artist.follow.push(user);
    await artistRepo.save(artist);
    return;
  }

  async removeArtistFromFavorite(artistId: number, uid: string): Promise<void> {
    const canAccess = await this.artistService.checkAccessible(artistId, uid);
    if (!canAccess) {
      throw new Error('You can not access this artist');
    }
    const userRepo = await this.dataSource.getRepository(User);
    const user = await userRepo.findOne({
      where: { uid },
    });
    const artistRepo = await this.dataSource.getRepository(Artist);
    const artist = await artistRepo.findOne({
      where: { id: artistId },
      relations: ['follow'],
    });
    artist.follow = artist.follow.filter((it) => it.id !== user.id);
    await artistRepo.save(artist);
    return;
  }

  async addAlbumToFavourite(albumId: number, uid: string): Promise<void> {
    const useAlbum = await this.albumService.findOne(albumId, uid);
    if (!useAlbum) {
      throw new Error('You can not access this album');
    }
    const userRepo = await this.dataSource.getRepository(User);
    const user = await userRepo.findOne({
      where: { uid },
    });
    const albumRepo = await this.dataSource.getRepository(Album);
    const album = await albumRepo.findOne({
      where: { id: albumId },
      relations: ['follow'],
    });
    album.follow.push(user);
    await albumRepo.save(album);
    return;
  }

  async removeAlbumFromFavourite(albumId: number, uid: string): Promise<void> {
    const useAlbum = await this.albumService.findOne(albumId, uid);
    if (!useAlbum) {
      throw new Error('You can not access this album');
    }
    const userRepo = await this.dataSource.getRepository(User);
    const user = await userRepo.findOne({
      where: { uid },
    });
    const albumRepo = await this.dataSource.getRepository(Album);
    const album = await albumRepo.findOne({
      where: { id: albumId },
      relations: ['follow'],
    });
    album.follow = album.follow.filter((it) => it.id !== user.id);
    await albumRepo.save(album);
    return;
  }

  async addTagToFavourite(tagId: number, uid: string): Promise<void> {
    const useTag = await this.tagService.findOne(tagId, uid);
    if (!useTag) {
      throw new Error('You can not access this tag');
    }
    const userRepo = await this.dataSource.getRepository(User);
    const user = await userRepo.findOne({
      where: { uid },
    });
    const tagRepo = await this.dataSource.getRepository(Tag);
    const tag = await tagRepo.findOne({
      where: { id: tagId },
      relations: ['follow'],
    });
    tag.follow.push(user);
    await tagRepo.save(tag);
    return;
  }

  async removeTagFromFavourite(tagId: number, uid: string): Promise<void> {
    const useTag = await this.tagService.findOne(tagId, uid);
    if (!useTag) {
      throw new Error('You can not access this tag');
    }
    const userRepo = await this.dataSource.getRepository(User);
    const user = await userRepo.findOne({
      where: { uid },
    });
    const tagRepo = await this.dataSource.getRepository(Tag);
    const tag = await tagRepo.findOne({
      where: { id: tagId },
      relations: ['follow'],
    });
    tag.follow = tag.follow.filter((it) => it.id !== user.id);
    await tagRepo.save(tag);
    return;
  }

  async addGenreToFavourite(genreId: number, uid: string): Promise<void> {
    const useGenre = await this.genreService.findOne(genreId, uid);
    if (!useGenre) {
      throw new Error('You can not access this genre');
    }
    const userRepo = await this.dataSource.getRepository(User);
    const user = await userRepo.findOne({
      where: { uid },
    });
    const genreRepo = await this.dataSource.getRepository(Genre);
    const genre = await genreRepo.findOne({
      where: { id: genreId },
      relations: ['follow'],
    });
    genre.follow.push(user);
    await genreRepo.save(genre);
    return;
  }

  async removeGenreFromFavourite(genreId: number, uid: string): Promise<void> {
    const useGenre = await this.genreService.findOne(genreId, uid);
    if (!useGenre) {
      throw new Error('You can not access this genre');
    }
    const userRepo = await this.dataSource.getRepository(User);
    const user = await userRepo.findOne({
      where: { uid },
    });
    const genreRepo = await this.dataSource.getRepository(Genre);
    const genre = await genreRepo.findOne({
      where: { id: genreId },
      relations: ['follow'],
    });
    genre.follow = genre.follow.filter((it) => it.id !== user.id);
    await genreRepo.save(genre);
    return;
  }
}
