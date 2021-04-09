import { Controller, Get, Req } from '@nestjs/common';
import { AccountService } from './account.service';

@Controller('account')
export class AccountController {
  constructor(private accountService: AccountService) {}
  @Get('my')
  async accountInfo(@Req() req: Request & { uid: string }) {
    return await this.accountService.getAccountInfo(req.uid);
  }
}
