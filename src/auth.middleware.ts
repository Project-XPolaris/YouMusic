import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction } from 'express';
import { User } from './database/entites/user';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth/auth.service';

@Injectable({})
export class AuthMiddleware implements NestMiddleware {
  constructor(
    private configService: ConfigService,
    private authService: AuthService,
  ) {}
  private auth() {
    return async (req, res, next) => {
      req.nid = req.headers.notification;
      if (this.configService.get('auth.enable')) {
        const rawAuth = req.headers.authorization;
        if (rawAuth === undefined) {
          req.uid = '-1';
        } else {
          const tokenString = rawAuth.replace('Bearer ', '');
          const { uid } = await this.authService.check(tokenString);
          if (uid) {
            req.uid = uid;
          }
        }
      } else {
        req.uid = '-1';
      }
      await this.save(req.uid);
      next();
    };
  }

  private async save(uid: string) {
    const user = new User();
    user.uid = uid;
    await user.createOrGet();
  }

  public use(
    req: Request & { uid: string },
    res: Response,
    next: NextFunction,
  ) {
    this.auth()(req, res, next);
  }
}
