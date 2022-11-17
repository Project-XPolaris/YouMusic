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

@Injectable()
export class AuthService {
  client: YouPlusClient;
  constructor(
    private configService: ConfigService,
    private YouAuthService: YouAuthService,
  ) {
    const authUrl = configService.get('youplus.url');
    this.client = new YouPlusClient(authUrl);
  }
  async check(token: string): Promise<{ uid: string } | undefined> {
    const response = await this.client.checkAuth(token);
    if (!response.success) {
      return undefined;
    }
    return {
      uid: response.uid,
    };
  }
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
  async generateYouAuthToken(
    code: string,
  ): Promise<{ oauth: Oauth; username: string }> {
    const authResponse = await this.YouAuthService.generateToken(code);
    if (!authResponse.access_token) {
      return;
    }
    return await this.linkYouAuthAccount(authResponse);
  }
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
  async linkYouAuthAccount(authResponse: GenerateTokenResult) {
    const userResponse = await this.YouAuthService.getCurrentUser(
      authResponse.access_token,
    );
    const oauthRepo = await getRepository(Oauth);
    // find exist
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
      // create user
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
}
