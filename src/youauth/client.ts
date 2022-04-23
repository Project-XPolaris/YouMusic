import axios from 'axios';

export interface GenerateTokenResult {
  success: boolean;
  err?: string;
  code?: string;
  data?: {
    accessToken: string;
    refreshToken: string;
  };
}

export interface GetCurrentUserResponse {
  success: boolean;
  err?: string;
  code?: string;
  data?: {
    id: number;
    username: string;
  };
}

export class YouAuthClient {
  private readonly apiUrl: string;
  private readonly appid: string;
  private readonly secret: string;

  constructor(apiUrl: string, appid: string, secret: string) {
    this.apiUrl = apiUrl;
    this.appid = appid;
    this.secret = secret;
  }

  public async generateToken(authCode: string): Promise<GenerateTokenResult> {
    const response = await axios.post(`${this.apiUrl}/oauth/token`, {
      appId: this.appid,
      secret: this.secret,
      code: authCode,
    });
    return response.data;
  }
  public async getCurrentUser(token: string): Promise<GetCurrentUserResponse> {
    const response = await axios.get(`${this.apiUrl}/auth/current`, {
      params: {
        token,
      },
    });
    return response.data;
  }
}
