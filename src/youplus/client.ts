import axios from 'axios';

export interface UserAuthResult {
  success: boolean;
  username: string;
  uid: string;
}

export interface DirItem {
  path: string;
  realPath: string;
  type: string;
}

export class YouPlusClient {
  private readonly apiUrl: string;

  constructor(apiUrl: string) {
    this.apiUrl = apiUrl;
  }

  public async checkAuth(token: string): Promise<UserAuthResult> {
    const response = await axios.get(`${this.apiUrl}/user/auth`, {
      params: { token },
    });
    return response.data;
  }

  public async readDir(target: string, token: string): Promise<DirItem[]> {
    const response = await axios.get(`${this.apiUrl}/path/readdir`, {
      headers: {
        Authorization: token,
      },
      params: {
        target,
      },
    });
    return response.data;
  }
  public async getRealPath(
    target: string,
    token: string,
  ): Promise<{ path: string }> {
    const response = await axios.get(`${this.apiUrl}/path/realpath`, {
      headers: {
        Authorization: token,
      },
      params: {
        target,
      },
    });
    return response.data;
  }
}
