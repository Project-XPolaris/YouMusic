import axios from 'axios';
import { ThumbnailGenerator } from './thumbnail.service';
import * as FormData from 'form-data';
import * as path from 'path';

export class ThumbnailClient implements ThumbnailGenerator {
  baseUrl: string;
  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async generate(input: Buffer): Promise<Buffer> {
    const postForm = new FormData();
    postForm.append('file', input, path.basename('file'));
    const response = await axios.post(`${this.baseUrl}/generator`, postForm, {
      headers: postForm.getHeaders(),
      params: {
        width: 120,
      },
    });
    return await response.data;
  }
}
