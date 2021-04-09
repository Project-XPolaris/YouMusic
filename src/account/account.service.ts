import { Injectable } from '@nestjs/common';
import { getRepository } from 'typeorm';
import { SpotifyAuth } from '../database/entites/spotify';
export interface AccountInfo {
  uid: string;
  spotifyLogin: boolean;
}
@Injectable()
export class AccountService {
  async getAccountInfo(uid: string): Promise<AccountInfo> {
    const info: AccountInfo = {
      uid,
      spotifyLogin: false,
    };
    const spotifyAuth = await getRepository(SpotifyAuth).findOne({ uid });
    if (spotifyAuth) {
      info.spotifyLogin = true;
    }
    return info;
  }
}
