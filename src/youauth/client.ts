import axios from 'axios';

export interface GenerateTokenResult {
  access_token: string;
  refresh_token: string;
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
    const response = await axios.post(`${this.apiUrl}/token`, {
      code: authCode,
      grant_type: 'authorization_code',
    });
    return response.data;
  }
  public async generateTokenByPassword(
    username: string,
    password: string,
  ): Promise<GenerateTokenResult> {
    const response = await axios(`${this.apiUrl}/token`, {
      method: 'post',
      data: {
        username,
        password,
        grant_type: 'password',
        client_id: this.appid,
      },
    });
    console.log(response.data);
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
