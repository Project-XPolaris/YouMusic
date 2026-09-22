import {
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InternalTokenGuard } from './internal.guard';

function ctxWithToken(token?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        headers: token === undefined ? {} : { 'x-internal-token': token },
      }),
    }),
  } as ExecutionContext;
}

describe('InternalTokenGuard', () => {
  const config = {
    get: (key: string) =>
      key === 'youplus.internal_token' ? 'secret-token' : undefined,
  } as ConfigService;
  const guard = new InternalTokenGuard(config);

  it('rejects missing token', () => {
    try {
      guard.canActivate(ctxWithToken());
      fail('expected HttpException');
    } catch (e) {
      expect(e).toBeInstanceOf(HttpException);
      expect((e as HttpException).getStatus()).toBe(HttpStatus.FORBIDDEN);
    }
  });

  it('rejects wrong token', () => {
    try {
      guard.canActivate(ctxWithToken('nope'));
      fail('expected HttpException');
    } catch (e) {
      expect((e as HttpException).getStatus()).toBe(HttpStatus.FORBIDDEN);
    }
  });

  it('accepts matching token', () => {
    expect(guard.canActivate(ctxWithToken('secret-token'))).toBe(true);
  });
});
