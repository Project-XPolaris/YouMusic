import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction } from 'express';
import { User } from './database/entites/user';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth/auth.service';
import { DataSource } from 'typeorm';

/**
 * 认证中间件
 * 用于处理请求中的认证信息，验证用户token并设置用户ID
 */
@Injectable({})
export class AuthMiddleware implements NestMiddleware {

  constructor(
    private configService: ConfigService,
    private authService: AuthService,
    private dataSource: DataSource
  ) {}


  /**
   * 认证处理函数
   * 验证请求头中的认证信息，设置用户ID
   */
  private auth() {
    return async (req, res, next) => {
      // 获取通知ID
      req.nid = req.headers.notification;
      
      // 检查是否启用认证
      if (this.configService.get('auth.enable')) {
        const rawAuth = req.headers.authorization;
        req.token = rawAuth;
        
        // 如果没有认证信息，设置默认用户ID
        if (rawAuth === undefined) {
          req.uid = '-1';
        } else {
          // 处理Bearer token
          const tokenString = rawAuth.replace('Bearer ', '');
          try {
            // 验证token并获取用户ID
            const { uid } = await this.authService.check(tokenString);
            if (uid) {
              req.uid = uid;
              // 使用锁机制处理用户创建
              await this.authService.getOrCreateUserByYouAuthToken(tokenString);
            }
          } catch (e) {
            // token验证失败，设置默认用户ID
            req.uid = '-1';
          }
        }
      } else {
        // 认证未启用，设置默认用户ID
        req.uid = '-1';
      }
      
      // 保存或获取用户信息
      await this.save(req.uid);
      next();
    };
  }

  /**
   * 保存或获取用户信息
   * @param uid 用户ID
   */
  private async save(uid: string) {
    const user = new User();
    user.uid = uid;
    await user.createOrGet(this.dataSource);
  }

  /**
   * 中间件使用入口
   * @param req 请求对象
   * @param res 响应对象
   * @param next 下一个中间件函数
   */
  public use(
    req: Request & { uid: string },
    res: Response,
    next: NextFunction,
  ) {
    this.auth()(req, res, next);
  }
}
