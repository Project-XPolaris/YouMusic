import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SpotifyAuth } from '../database/entites/spotify';
export interface AccountInfo {
  uid: string;
  spotifyLogin: boolean;
}
@Injectable()
export class AccountService {
  constructor(private dataSource: DataSource) {}
  async getAccountInfo(uid: string): Promise<AccountInfo> {
    const info: AccountInfo = {
      uid,
      spotifyLogin: false,
    };
    const spotifyAuth = await this.dataSource.getRepository(SpotifyAuth).findOne({
      where: { uid },
    });
    if (spotifyAuth) {
      info.spotifyLogin = true;
    }
    return info;
  }
}
