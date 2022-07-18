import { Injectable } from '@nestjs/common';
import {
  APIBaseResponse,
  login_cellphone,
  search,
  SearchType,
  lyric,
  album,
} from 'NeteaseCloudMusicApi';
import { createHash } from 'crypto';

@Injectable()
export class NeteasemusicService {
  async login(phoneNumber: string, password: string) {
    const rawPassword = createHash('md5').update(password).digest('hex');
    const response = await login_cellphone({
      phone: phoneNumber,
      md5_password: rawPassword,
    });
    return response;
  }

  async search(
    key: string,
    {
      limit,
      type,
      artist,
    }: {
      type?: SearchType;
      limit?: number;
      artist?: string;
    },
  ): Promise<APIBaseResponse & any> {
    if (artist) {
      key = `${key} ${artist}`;
    }
    const response = await search({ keywords: key, type, limit });
    return response.body.result;
  }
  async getAlbumWithId(id): Promise<any> {
    return album({ id });
  }
  async getLyric(id: string): Promise<any> {
    const response = await lyric({ id });
    return response.body.lrc as string;
  }
}
