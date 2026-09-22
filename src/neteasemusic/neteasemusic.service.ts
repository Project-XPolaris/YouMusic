import { Injectable } from '@nestjs/common';
import {
  APIBaseResponse,
  login_cellphone,
  search,
  SearchType,
  lyric,
  album,
  artist_detail,
  artist_desc,
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
  async getLyric(id: string): Promise<string> {
    const response = await lyric({ id });
    const lrc = response.body?.lrc as string | { lyric?: string } | undefined;
    if (!lrc) return '';
    if (typeof lrc === 'string') return lrc;
    return lrc.lyric || '';
  }

  async getArtistDetail(id: string | number): Promise<{
    name?: string;
    briefDesc?: string;
    alias?: string[];
    picUrl?: string;
    transNames?: string[];
  } | null> {
    try {
      const response = await artist_detail({ id });
      const artist = (response.body as any)?.data?.artist;
      return artist || null;
    } catch {
      return null;
    }
  }

  async getArtistDesc(id: string | number): Promise<string> {
    try {
      const response = await artist_desc({ id });
      const body = response.body as any;
      const brief = String(body?.briefDesc || '').trim();
      if (brief) return brief;
      const intro = body?.introduction;
      if (Array.isArray(intro)) {
        return intro
          .map((it: any) => [it?.ti, it?.txt].filter(Boolean).join('\n'))
          .filter(Boolean)
          .join('\n\n')
          .trim();
      }
      return String(body?.introduction || '').trim();
    } catch {
      return '';
    }
  }
}
