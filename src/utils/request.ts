import { HttpService } from '@nestjs/axios';
import { Buffer } from 'buffer';
import { firstValueFrom } from 'rxjs';

export const getArrayBufferFromUrl = async (
  service: HttpService,
  url,
): Promise<{ response; buf: Buffer }> => {
  const response = await firstValueFrom(
    service.request({
      url,
      method: 'GET',
      responseType: 'arraybuffer',
    }),
  );
  const buf = Buffer.from(response.data, 'binary');
  return {
    response,
    buf,
  };
};
