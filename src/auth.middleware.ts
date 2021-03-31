import { HttpService, Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction } from 'express';
import { User } from './database/entites/user';

@Injectable()
export class AuthMiddleware implements NestMiddleware {
  private auth() {
    return async (req, res, next) => {
      const rawAuth = req.headers['Authorization'];
      if (rawAuth === undefined) {
        req.uid = '-1';
      } else {
        const tokenString = rawAuth.replace('Bearer ', '');
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
