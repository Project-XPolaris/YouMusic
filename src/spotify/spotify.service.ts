import { HttpService, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getConnection, getRepository } from 'typeorm';
import { SpotifyAuth } from '../database/entites/spotify';
import dayjs = require('dayjs');
import { stringToBase64 } from '../utils/string';
import { NotificationService } from '../notification/notification.service';

export interface SpotifyTokenResult {
  access_token: string;
  token_type: string;
  scope: string;
  expires_in: number;
  refresh_token: string;
}
@Injectable()
export class SpotifyService {
  client;
  constructor(
    private configService: ConfigService,
    private http: HttpService,
  ) {}
  async refreshToken(code: string, uid: string) {
    try {
      const response = await this.http
        .request<SpotifyTokenResult>({
          url: 'https://accounts.spotify.com/api/token',
          method: 'post',
          params: {
            grant_type: 'authorization_code',
            code,
            redirect_uri: 'http://localhost:3070/spotify/login/callback',
          },
          // 'headers' are custom headers to be sent
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${stringToBase64(
              `${this.configService.get(
                'spotify.clientId',
              )}:${this.configService.get('spotify.secret')}`,
            )}`,
          },
        })
        .toPromise();
      let authRec = await getRepository(SpotifyAuth).findOne({ uid });
      if (authRec === undefined) {
        authRec = new SpotifyAuth();
      }
      authRec.uid = uid;
      authRec.refresh_token = response.data.refresh_token;
      authRec.scope = response.data.scope;
      authRec.accessToken = response.data.access_token;
      authRec.exp = response.data.expires_in;
      await getRepository(SpotifyAuth).save(authRec);
    } catch (e) {
      console.log(e);
    }
  }
  async renewAccessToken(refreshToken: string, uid: string) {
    try {
      const response = await this.http
        .request<SpotifyTokenResult>({
          url: 'https://accounts.spotify.com/api/token',
          method: 'post',
          params: {
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
          },
          // 'headers' are custom headers to be sent
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${stringToBase64(
              `${this.configService.get(
                'spotify.clientId',
              )}:${this.configService.get('spotify.secret')}`,
            )}`,
          },
        })
        .toPromise();
      let authRec = await getRepository(SpotifyAuth).findOne({ uid });
      if (authRec === undefined) {
        authRec = new SpotifyAuth();
      }
      authRec.uid = uid;
      authRec.refresh_token = response.data.refresh_token;
      authRec.scope = response.data.scope;
      authRec.accessToken = response.data.access_token;
      authRec.exp = response.data.expires_in;
      await getRepository(SpotifyAuth).save(authRec);
      return response.data.access_token;
    } catch (e) {
      console.log(e);
    }
  }
  async getUserAccessToken(uid: string) {
    const auth = await getRepository(SpotifyAuth).findOne({ uid });
    if (auth === undefined) {
      throw new Error('user not login');
    }
    const isExpire = dayjs(auth.updatedAt)
      .add(auth.exp, 'seconds')
      .isBefore(dayjs());
    if (isExpire) {
      return await this.renewAccessToken(auth.refresh_token, uid);
    }
    return auth.accessToken;
  }
  async unlink(uid: string): Promise<void> {
    await getConnection()
      .createQueryBuilder()
      .delete()
      .from(SpotifyAuth)
      .where('uid = :uid', { uid })
      .execute();
    return;
  }
  async search(q: string, type: string, uid: string) {
    const auth = await this.getUserAccessToken(uid);
    const response = await this.http
      .get('https://api.spotify.com/v1/search', {
        params: {
          q,
          type,
        },
        headers: {
          authorization: `Bearer ${auth}`,
        },
      })
      .toPromise();
    return response.data;
  }
}
