import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';
import { Observable } from 'rxjs';

export interface LogRPCService {
  writeLog: (data: {
    application: string;
    instance: string;
    scope: string;
    extra: string;
    message: string;
    level: number;
    time: number;
  }) => Observable<{ success: boolean }>;
}
@Injectable()
export class LogService implements OnModuleInit {
  private instanceId: string;
  private enableLog = false;
  constructor(
    @Inject('YOULOG_SERVICE') private client: ClientGrpc,
    private configService: ConfigService,
  ) {
    this.instanceId = `${configService.get('youlog.name') ?? 'youmusiccore'}_${(
      Math.random() + 1
    )
      .toString(36)
      .substring(7)}`;
    this.enableLog = configService.get('youlog.enable');
  }
  private getName() {
    return this.configService.get('youplus.name') ?? 'youmusiccore';
  }
  private logRPCService: LogRPCService;
  public info({
    content,
    extra,
    scope,
  }: {
    content: string;
    extra?: any;
    scope?: string;
  }) {
    if (!extra) {
      Logger.verbose(`[${scope}] ${content}`);
    } else {
      Logger.verbose(`[${scope}] ${content}`, extra);
    }
    if (!this.enableLog) {
      return;
    }
    this.logRPCService
      .writeLog({
        application: this.getName(),
        instance: this.instanceId,
        scope: scope ?? 'Global',
        extra: JSON.stringify(extra ?? {}),
        message: content,
        level: 2,
        time: Date.now(),
      })
      .subscribe();
  }
  public error({
    content,
    extra,
    scope,
  }: {
    content: string;
    extra?: any;
    scope?: string;
  }) {
    if (!extra) {
      Logger.error(`[${scope}] ${content}`);
    } else {
      Logger.error(`[${scope}] ${content}`, extra);
    }
    if (!this.enableLog) {
      return;
    }
    this.logRPCService
      .writeLog({
        application: this.getName(),
        instance: this.instanceId,
        scope: scope ?? 'Global',
        extra: JSON.stringify(extra ?? {}),
        message: content,
        level: 1,
        time: Date.now(),
      })
      .subscribe();
  }
  async onModuleInit() {
    this.logRPCService = this.client.getService<LogRPCService>('LogService');
  }
}
