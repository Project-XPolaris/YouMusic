import { Module } from '@nestjs/common';
import {
  ClientProxyFactory,
  ClientsModule,
  Transport,
} from '@nestjs/microservices';
import * as path from 'path';
import { ConfigService } from '@nestjs/config';
import { LogService } from './log.service';

@Module({
  imports: [
    ClientsModule.register([
      {
        name: 'YOULOG_SERVICE',
        transport: Transport.GRPC,
        options: {
          package: 'youlog',
          protoPath: path.join(__dirname, '../rpc', 'youlog_service.proto'),
        },
      },
    ]),
  ],
  providers: [
    ConfigService,
    {
      provide: 'YOULOG_SERVICE',
      useFactory: (configService: ConfigService) => {
        const url = configService.get('youlog.rpc');
        return ClientProxyFactory.create({
          transport: Transport.GRPC,
          options: {
            package: 'youlog',
            protoPath: path.join(__dirname, '../rpc', 'youlog_service.proto'),
            url,
          },
        });
      },
      inject: [ConfigService],
    },
    LogService,
  ],
  exports: [LogService],
})
export class LogModule {}
