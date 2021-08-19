import { Module } from '@nestjs/common';
import {
  ClientProxyFactory,
  ClientsModule,
  Transport,
} from '@nestjs/microservices';
import * as path from 'path';
import { ConfigService } from '@nestjs/config';
import { EntityService } from './entity.service';

@Module({
  imports: [
    ClientsModule.register([
      {
        name: 'YOUPLUS_SERVICE',
        transport: Transport.GRPC,
        options: {
          package: 'youplus',
          protoPath: path.join(__dirname, '../rpc', 'youplus_service.proto'),
        },
      },
    ]),
  ],
  providers: [
    ConfigService,
    {
      provide: 'YOUPLUS_SERVICE',
      useFactory: (configService: ConfigService) => {
        const url = configService.get('youplus.rpc');
        return ClientProxyFactory.create({
          transport: Transport.GRPC,
          options: {
            package: 'youplus',
            protoPath: path.join(__dirname, '../rpc', 'youplus_service.proto'),
            url,
          },
        });
      },
      inject: [ConfigService],
    },
    EntityService,
  ],
  exports: [EntityService],
})
export class EntityModule {}
