import { Injectable } from '@nestjs/common';
import { CreateMusicDto } from './dto/create-music.dto';
import { UpdateMusicDto } from './dto/update-music.dto';
import { getRepository } from 'typeorm';
import { Music } from 'src/database/entites/music';

@Injectable()
export class MusicService {
  async findAll() {
    const musicRepository = getRepository(Music);
    return musicRepository.findAndCount();
  }

  async findOne(id: number) {
    const musicRepository = getRepository(Music);
    return await musicRepository.findOne(id);
  }

  update(id: number, updateMusicDto: UpdateMusicDto) {}

  async remove(id: number) {
    const musicRepository = getRepository(Music);
    return await musicRepository.delete(id);
  }
}
