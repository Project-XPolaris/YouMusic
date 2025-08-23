import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as bodyParser from 'body-parser';
import { ConfigService } from '@nestjs/config';
import { hostname, networkInterfaces } from 'os';

// runtime import to avoid types mismatch if module missing in some envs
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { NacosNamingClient } = require('nacos');

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true });
  app.use(bodyParser.json({ limit: '50mb' }));
  app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
  app.enableCors({
    origin: '*',
    methods: 'GET, PUT, POST, DELETE',
    allowedHeaders: 'Content-Type, Authorization',
  });
  const configService = app.get(ConfigService);
  const listenPort = Number(process.env.PORT || 3001);

  await app.listen(listenPort);

  const nacosCfg = configService.get('nacos');
  if (nacosCfg && nacosCfg.enable) {
    const serviceName: string = nacosCfg.serviceName || 'youmusic-service';
    const groupName: string = nacosCfg.group || 'DEFAULT_GROUP';
    const serverAddr: string = nacosCfg.server || '127.0.0.1:8848';
    const namespace: string = nacosCfg.namespaceId || '';
    const username: string = nacosCfg.username || '';
    const password: string = nacosCfg.password || '';
    const serviceIp: string = nacosCfg.serviceIp || '';

    const client = new NacosNamingClient({
      logger: console,
      serverList: serverAddr,
      namespace,
      username,
      password,
    });

    const resolveLocalAddress = (): string => {
      if (serviceIp && typeof serviceIp === 'string' && serviceIp.length > 0) {
        return serviceIp;
      }
      const nets = networkInterfaces();
      for (const name of Object.keys(nets)) {
        const addrs = nets[name] || [];
        for (const a of addrs) {
          if (a && a.family === 'IPv4' && !a.internal) {
            return a.address;
          }
        }
      }
      return '127.0.0.1';
    };

    const localIp = resolveLocalAddress();

    await client.ready();
    await client.registerInstance(serviceName, {
      ip: localIp,
      port: listenPort,
      healthy: true,
      weight: 1,
      metadata: {
        host: hostname(),
      },
    }, groupName);

    const shutdown = async () => {
      try {
        await client.deregisterInstance(serviceName, { ip: localIp, port: listenPort }, groupName);
      } catch (e) {
        // ignore
      } finally {
        process.exit(0);
      }
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  }
}
bootstrap();
