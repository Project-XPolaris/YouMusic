import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { Observable } from 'rxjs/dist/types';
import { ConfigService } from '@nestjs/config';
import * as os from 'os';

export interface YouPlusService {
  registerEntry(data: {
    name: string;
    version: number;
    instance: string;
  }): Observable<{ success: boolean; reason?: string; code?: number }>;
  entryHeartbeat(data: {
    name: string;
    state: string;
    instance: string;
  }): Observable<{ success: boolean; reason?: string; code?: number }>;
  updateEntryExport(data: {
    data: string;
    instance: string;
  }): Observable<{ success: boolean; reason?: string; code?: number }>;
}
@Injectable()
export class EntityService implements OnModuleInit {
  private heartbeatTickTime =
    this.configService.get('youplus.entity.heartbeat') ?? 3000;
  private instanceId: string;
  constructor(
    @Inject('YOUPLUS_SERVICE') private client: ClientGrpc,
    private configService: ConfigService,
  ) {
    this.instanceId = `${
      configService.get('youplus.entity.name') ?? 'youmusiccore'
    }_${(Math.random() + 1).toString(36).substring(7)}`;
  }
  private getName() {
    return this.configService.get('youplus.entity.name') ?? 'youmusiccore';
  }
  private getVersion() {
    return this.configService.get('youplus.entity.version') ?? 1;
  }
  private youplusService: YouPlusService;
  async registerEntity() {
    return this.youplusService.registerEntry({
      name: this.getName(),
      instance: this.instanceId,
      version: this.getVersion(),
    });
  }
  async heartbeat() {
    await this.youplusService
      .entryHeartbeat({
        name: this.getName(),
        instance: this.instanceId,
        state: 'online',
      })
      .subscribe({
        next: async (data) => {
          if (data.code && data.code.toString() === '6001') {
            console.log('register app');
            const obs = await this.registerEntity();
            obs.subscribe({
              next: async () => {
                (await this.setExport()).subscribe({
                  error: (e) => {
                    console.log(e);
                  },
                });
              },
              error: (e) => {
                console.log(e);
              },
            });
          }
        },
        error: (err) => {
          console.log(err);
        },
      });
  }
  heartbeatTick() {
    setTimeout(() => {
      this.heartbeat();
      this.heartbeatTick();
    }, this.heartbeatTickTime);
  }
  async setExport() {
    const exp: any = {};
    const urls: Array<string> = [];
    Object.values(os.networkInterfaces()).forEach((group) => {
      group.forEach((addr) => {
        if (!addr.internal && addr.family === 'IPv4') {
          urls.push(`http://${addr.address}:3000`);
        }
      });
    });
    exp.urls = urls;
    exp.Extra = {};
    return this.youplusService.updateEntryExport({
      data: JSON.stringify(exp),
      instance: this.instanceId,
    });
  }
  async onModuleInit() {
    this.youplusService = this.client.getService<YouPlusService>(
      'YouPlusService',
    );

    // const result = await this.registerEntity();
    // const s = result.subscribe({
    //   next: (data) => {
    //     console.log(data);
    //   },
    // });
    this.heartbeatTick();
    // this.heartbeat();
  }
}
