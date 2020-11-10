import { Injectable } from '@nestjs/common';
import { CreateArtistDto } from './dto/create-artist.dto';
import { UpdateArtistDto } from './dto/update-artist.dto';
import { getRepository } from 'typeorm';
import { Music } from '../database/entites/music';
import { Artist } from '../database/entites/artist';

@Injectable()
export class ArtistService {
  async findAll() {
    const artistRepository = getRepository(Artist);
    return await artistRepository.find();
  }

  async findOne(id: number) {
    const artistRepository = getRepository(Artist);
    return await artistRepository.findOne(id)
  }
}
