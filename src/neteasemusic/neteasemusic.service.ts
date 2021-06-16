import { Injectable } from '@nestjs/common';
import {
  APIBaseResponse,
  login_cellphone,
  search,
  SearchType,
  lyric,
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
    }: {
      type?: SearchType;
      limit?: number;
    },
  ): Promise<APIBaseResponse & any> {
    const response = await search({ keywords: key, type, limit });
    return response.body.result;
  }
  async getLyric(id: string): Promise<any> {
    const response = await lyric({ id });
    return response.body.lrc as string;
  }
}
