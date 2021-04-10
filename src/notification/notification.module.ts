import { Global, Module } from '@nestjs/common';
import { NotificationService } from './notification.service';

@Module({
  providers: [NotificationService],
  exports: [NotificationService],
})
@Global()
export class NotificationModule {}
