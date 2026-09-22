import axios, { AxiosInstance } from 'axios';

export type EmbedResult = {
  embedding: number[];
  model?: string;
  dim?: number;
  duration_used?: number;
};

export type AudioTagResult = {
  vocal: {
    type: string; // "female" | "male" | "instrumental" | "duet"
    label: string;
    confidence: number;
  };
  instruments: Array<{
    name: string;
    label: string;
    confidence: number;
  }>;
  genres: Array<{
    name: string;
    label: string;
    confidence: number;
  }>;
  moods: Array<{
    name: string;
    label: string;
    confidence: number;
  }>;
  all_tags: string[];
  duration_analyzed?: number;
  model?: string;
};

export type HealthResult = {
  status: string;
  model?: string;
  loaded?: boolean;
  device?: string;
  dim?: number;
  error?: string;
};

export class AudioEmbedClient {
  private http: AxiosInstance;
  readonly host: string;

  constructor(host: string, timeoutMs = 120000) {
    this.host = host.replace(/\/$/, '');
    this.http = axios.create({
      baseURL: this.host,
      timeout: timeoutMs,
    });
  }

  async health(): Promise<HealthResult> {
    const { data } = await this.http.get<HealthResult>('/health');
    return data;
  }

  async embedAudio(params: {
    path: string;
    start_sec?: number;
    duration_sec?: number;
  }): Promise<EmbedResult> {
    const { data } = await this.http.post<EmbedResult>('/embed-audio', params);
    return data;
  }

  async embedText(text: string): Promise<EmbedResult> {
    const { data } = await this.http.post<EmbedResult>('/embed-text', { text });
    return data;
  }

  async tagAudio(params: {
    path: string;
    start_sec?: number;
    duration_sec?: number;
    threshold?: number;
  }): Promise<AudioTagResult> {
    const { data } = await this.http.post<AudioTagResult>('/audio/tag', params);
    return data;
  }

  async isUp(): Promise<boolean> {
    try {
      const h = await this.health();
      return h.status === 'ok' && h.loaded === true;
    } catch {
      return false;
    }
  }
}
