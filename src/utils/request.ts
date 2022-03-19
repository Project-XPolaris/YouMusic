import { HttpService } from '@nestjs/common';
import { Buffer } from 'buffer';

export const getArrayBufferFromUrl = async (
  service: HttpService,
  url,
): Promise<{ response; buf: Buffer }> => {
  const response = await service
    .request({
      url,
      method: 'GET',
      responseType: 'arraybuffer',
    })
    .toPromise();
  const buf = Buffer.from(response.data, 'binary');
  return {
    response,
    buf,
  };
};
