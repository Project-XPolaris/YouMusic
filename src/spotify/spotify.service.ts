import { HttpService, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getRepository } from 'typeorm';
import { SpotifyAuth } from '../database/entites/spotify';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const FormData = require('form-data');

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
      const form = new FormData();
      form.append(
        'redirect_url',
        'http://localhost:3000/spotify/login/callback',
      );
      form.append('grant_type', 'authorization_code');
      form.append('code', code);
      const response = await this.http
        .post<SpotifyTokenResult>(
          'https://accounts.spotify.com/api/token',
          form,
        )
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
  async search(q: string, type: string) {
    const token = this.configService.get('spotify_token');
    const response = await this.http
      .get('https://api.spotify.com/v1/search', {
        params: {
          q,
          type,
        },
        headers: {
          authorization: `Bearer ${token}`,
        },
      })
      .toPromise();
    console.log(response.data);
    return response.data;
  }
}
