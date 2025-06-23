import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { YouPlusClient } from '../youplus/client';
import { YouAuthService } from '../youauth/youauth.service';
import { getRepository } from 'typeorm';
import { Oauth } from '../database/entites/oauth';
import { User } from '../database/entites/user';
import { v4 as uuidv4 } from 'uuid';
import { decode, JwtPayload } from 'jsonwebtoken';
import { GenerateTokenResult } from '../youauth/client';

/**
 * 认证服务类
 * 处理用户认证、令牌验证和账户关联等功能
 */
@Injectable()
export class AuthService {
  client: YouPlusClient;
  private userCreationLocks: Map<string, Promise<User>> = new Map();

  constructor(
    private configService: ConfigService,
    private YouAuthService: YouAuthService,
  ) {
    const authUrl = configService.get('youplus.url');
    this.client = new YouPlusClient(authUrl);
  }

  /**
   * 检查令牌是否有效
   * @param token 访问令牌
   * @returns 如果令牌有效，返回用户ID；否则返回undefined
   */
  async check(token: string): Promise<{ uid: string } | undefined> {
    // 检查令牌来源
    const rawToken = decode(token);
    if (rawToken instanceof String) {
      return undefined;
    }
    const payload = rawToken as JwtPayload;
    const iss = payload.iss;
    switch (iss) {
      case 'YouPlusService':
        const youplusAuthResponse = await this.client.checkAuth(token);
        if (!youplusAuthResponse.success) {
          return undefined;
        }
        return {
          uid: youplusAuthResponse.uid,
        };
      case 'youauth':
        const response = await this.YouAuthService.getCurrentUser(token);
        if (!response.success) {
          return undefined;
        }
        return {
          uid: response.data.id.toString(),
        };
    }
    return undefined;
  }

  /**
   * 验证令牌并获取用户信息
   * @param token 访问令牌
   * @returns 如果验证成功，返回用户信息；否则返回undefined
   */
  async checkAuth(token: string): Promise<User | undefined> {
    const oauthRepo = getRepository(Oauth);
    const oauth = await oauthRepo.findOne({
      relations: ['user'],
      where: {
        accessToken: token,
      },
    });
    if (!oauth) {
      throw new Error('Invalid token');
    }
    const rawToken = decode(token);
    if (rawToken instanceof String) {
      return undefined;
    }
    const payload = rawToken as JwtPayload;
    const iss = payload.iss;
    switch (iss) {
      case 'YouPlusService':
        const youplusAuthResponse = await this.client.checkAuth(token);
        if (!youplusAuthResponse.success) {
          return undefined;
        }
        return oauth.user;
      case 'youauth':
        const response = await this.YouAuthService.getCurrentUser(token);
        if (!response.success) {
          return undefined;
        }
        return oauth.user;
      default:
        throw new Error('Invalid token');
    }
  }

  /**
   * 使用授权码生成YouAuth令牌
   * @param code 授权码
   * @returns 包含OAuth信息和用户名的对象
   */
  async generateYouAuthToken(
    code: string,
  ): Promise<{ oauth: Oauth; username: string }> {
    const authResponse = await this.YouAuthService.generateToken(code);
    if (!authResponse.access_token) {
      return;
    }
    return await this.linkYouAuthAccount(authResponse);
  }

  /**
   * 使用用户名和密码生成YouAuth令牌
   * @param username 用户名
   * @param password 密码
   * @returns 包含OAuth信息和用户名的对象
   */
  async generateYouAuthPasswordToken(
    username: string,
    password: string,
  ): Promise<{ oauth: Oauth; username: string }> {
    const authResponse = await this.YouAuthService.generateTokenByPassword(
      username,
      password,
    );
    if (!authResponse.access_token) {
      return;
    }
    return await this.linkYouAuthAccount(authResponse);
  }

  /**
   * 关联YouAuth账户
   * @param authResponse 认证响应
   * @returns 包含OAuth信息和用户名的对象
   */
  async linkYouAuthAccount(authResponse: GenerateTokenResult) {
    const userResponse = await this.YouAuthService.getCurrentUser(
      authResponse.access_token,
    );
    const oauthRepo = await getRepository(Oauth);
    // 查找已存在的OAuth记录
    const existOauth = await oauthRepo.findOne({
      relations: ['user'],
      where: {
        uid: String(userResponse.data.id),
        provider: 'youauth',
      },
    });
    let user: User;
    if (existOauth && existOauth.user) {
      user = existOauth.user;
    } else {
      // 创建新用户
      const userRepo = await getRepository(User);
      const newUser = new User();
      newUser.uid = uuidv4();
      user = await userRepo.save(newUser);
    }
    let oauthRec = new Oauth();
    oauthRec.uid = String(userResponse.data.id);
    oauthRec.accessToken = authResponse.access_token;
    oauthRec.refreshToken = authResponse.refresh_token;
    oauthRec.provider = 'youauth';
    oauthRec.user = user;

    oauthRec = await oauthRepo.save(oauthRec);
    return {
      oauth: oauthRec,
      username: userResponse.data.username,
    };
  }

  /**
   * 获取当前用户信息
   * @param accessCode 访问码
   * @returns 用户信息
   */
  async getCurrentUser(accessCode: string) {
    const authResponse = await this.YouAuthService.generateToken(accessCode);
    if (!authResponse.access_token) {
      return;
    }
    const userResponse = await this.YouAuthService.getCurrentUser(
      authResponse.refresh_token,
    );
    return userResponse.data;
  }

  /**
   * 通过 YouAuth 的 token 来创建用户
   * @param token YouAuth 的 token
   * @returns 用户信息
   */
  async getOrCreateUserByYouAuthToken(token: string) {
    const userResponse = await this.YouAuthService.getCurrentUser(token);
    if (!userResponse.success) {
      return;
    }

    const userId = userResponse.data.id.toString();
    
    // Check if there's an ongoing creation process for this user
    const existingLock = this.userCreationLocks.get(userId);
    if (existingLock) {
      return existingLock;
    }

    // Create a new lock for this user creation
    const creationPromise = (async () => {
      try {
        // 查找已存在的用户
        const userRepo = await getRepository(User);
        const user = await userRepo.findOne({
          where: {
            uid: userId,
          },
        });
        if (user) {
          return user;
        }
        const newUser = new User();
        newUser.uid = userId;
        newUser.createdAt = new Date();
        newUser.updatedAt = new Date();
        const savedUser = await userRepo.save(newUser);

        // 保存 token
        const oauthRepo = await getRepository(Oauth);
        const oauth = new Oauth();
        oauth.uid = userId;
        oauth.accessToken = token;
        oauth.refreshToken = token;
        oauth.provider = 'youauth';
        oauth.user = savedUser;
        await oauthRepo.save(oauth);
        return savedUser;
      } finally {
        // Clean up the lock
        this.userCreationLocks.delete(userId);
      }
    })();

    // Store the promise in the locks map
    this.userCreationLocks.set(userId, creationPromise);

    return creationPromise;
  }
}
