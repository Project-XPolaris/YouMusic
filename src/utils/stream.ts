import { Readable } from 'stream';
import { ServerResponse } from 'http';

/**
 * Pipe a readable stream to an HTTP response without crashing the process
 * on late ENOENT / read errors.
 */
export function pipeReadableSafely(
  stream: Readable,
  res: ServerResponse,
  opts?: { statusCode?: number },
) {
  const fail = (status = 404) => {
    if (!res.headersSent) {
      res.statusCode = status;
      res.end();
    } else {
      res.destroy();
    }
  };

  stream.on('error', () => fail(opts?.statusCode ?? 404));
  res.on('close', () => {
    if (!stream.destroyed) {
      stream.destroy();
    }
  });
  stream.pipe(res);
}
