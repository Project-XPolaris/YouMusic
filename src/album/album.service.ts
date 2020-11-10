import { Injectable } from '@nestjs/common';
import { getRepository } from 'typeorm';
import { Album } from '../database/entites/album';

@Injectable()
export class AlbumService {
  async findAll() {
    const albumRepository = getRepository(Album);
    return albumRepository.find()
  }

  async findOne(id: number) {
    const albumRepository = getRepository(Album);
    return albumRepository.findOne(id)
  }

}
