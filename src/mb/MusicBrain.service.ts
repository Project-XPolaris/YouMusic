import { HttpService, Injectable } from '@nestjs/common';
import { mbApi } from '../mb';

@Injectable()
export class MusicBrainService {
  constructor(private http: HttpService) {}
  async searchAlbum(query: {
    release?: string;
    artistname?: string;
    inc?: any;
  }) {
    return await mbApi.search('release', { query: query });
  }
  async getRelease(id: string) {
    return await mbApi.lookupRelease(id, ['recordings', 'artists']);
  }
  async getReleaseArt(release) {
    const response = await this.http
      .get(`http://coverartarchive.org/release/${release}`, {
        proxy: {
          protocol: 'http',
          host: '127.0.0.1',
          port: 7890,
        },
      })
      .toPromise();
    return response.data;
  }
}
