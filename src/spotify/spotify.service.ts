import { HttpService, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SpotifyService {
  client;
  constructor(
    private configService: ConfigService,
    private http: HttpService,
  ) {}
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
    console.log(response.data)
    return response.data;
  }
}
