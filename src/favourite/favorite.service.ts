import { Injectable } from '@nestjs/common';
import { getRepository } from 'typeorm';
import { Artist } from '../database/entites/artist';
import { User } from '../database/entites/user';
import { ArtistService } from '../artist/artist.service';
import { AlbumService } from '../album/album.service';
import { Album } from '../database/entites/album';

@Injectable()
export class FavoriteService {
  constructor(
    private artistService: ArtistService,
    private albumService: AlbumService,
  ) {}
  async addArtistToFavourite(artistId: number, uid: string): Promise<void> {
    const canAccess = await this.artistService.checkAccessible(artistId, uid);
    if (!canAccess) {
      throw new Error('You can not access this artist');
    }
    const userRepo = await getRepository(User);
    const user = await userRepo.findOne({
      where: { uid },
    });
    const artistRepo = await getRepository(Artist);
    const artist = await artistRepo.findOne({
      where: { id: artistId },
      relations: ['follow'],
    });
    artist.follow.push(user);
    await artistRepo.save(artist);
    return;
  }
  async addAlbumToFavourite(albumId: number, uid: string): Promise<void> {
    const useAlbum = await this.albumService.findOne(albumId, uid);
    if (!useAlbum) {
      throw new Error('You can not access this album');
    }
    const userRepo = await getRepository(User);
    const user = await userRepo.findOne({
      where: { uid },
    });
    const albumRepo = await getRepository(Album);
    const album = await albumRepo.findOne({
      where: { id: albumId },
      relations: ['follow'],
    });
    album.follow.push(user);
    await albumRepo.save(album);
    return;
  }
}
