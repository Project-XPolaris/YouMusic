import axios from 'axios';
export interface UserAuthResult {
  success: boolean;
  username: string;
  uid: string;
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
}
