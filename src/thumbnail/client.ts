import axios from 'axios';
import * as fs from 'fs';
import { ThumbnailGenerator } from './thumbnail.service';
import * as FormData from 'form-data';
import * as path from 'path';

export class ThumbnailClient implements ThumbnailGenerator {
  baseUrl: string;
  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async generate(input: Buffer, output: string): Promise<void> {
    const postForm = new FormData();

    postForm.append('file', input, path.basename(output));
    const response = await axios.post(`${this.baseUrl}/generator`, postForm, {
      headers: postForm.getHeaders(),
      params: {
        width: 120,
      },
    });
    await response.data.pipe(fs.createWriteStream(output));
  }
}
