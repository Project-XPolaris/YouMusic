import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class InternalTokenGuard implements CanActivate {
  constructor(private configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = (
      this.configService.get<string>('youplus.internal_token') || ''
    ).trim();
    if (!expected) {
      throw new HttpException(
        { success: false, reason: 'internal_token not configured' },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    const req = context.switchToHttp().getRequest();
    const got = String(req.headers['x-internal-token'] || '').trim();
    if (!got || got !== expected) {
      throw new HttpException(
        { success: false, reason: 'invalid internal token' },
        HttpStatus.FORBIDDEN,
      );
    }
    return true;
  }
}
