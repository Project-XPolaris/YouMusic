import { Injectable } from '@nestjs/common';
import {
  APIBaseResponse,
  login_cellphone,
  search,
  SearchType,
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
    type: SearchType | undefined,
  ): Promise<APIBaseResponse & any> {
    const response = await search({ keywords: key, type });
    return response.body.result;
  }
}
