import { Injectable } from '@nestjs/common';
import * as WebSocket from 'ws';
import { v4 } from 'uuid';
import { MediaLibrary } from '../database/entites/library';
export type NotificationEvent =
  | 'Register'
  | 'RefreshSpotifyAuth'
  | 'LibraryScanComplete';
interface NotificationClient {
  client: WebSocket;
  id: string;
}
@Injectable()
export class NotificationService {
  wss: WebSocket.Server;
  clients: Array<NotificationClient> = [];
  private static sendEvent(
    ws: WebSocket,
    event: NotificationEvent,
    data: any = {},
  ) {
    ws.send(
      JSON.stringify({
        event,
        data,
      }),
    );
  }
  constructor() {
    this.wss = new WebSocket.Server({
      port: 3010,
    });
    this.wss.on('connection', (ws) => {
      const id = v4();
      this.clients.push({
        client: ws,
        id,
      });
      NotificationService.sendEvent(ws, 'Register', {
        id,
      });
    });
  }

  async spotifyRefreshEvent(id: string) {
    for (const client of this.clients) {
      if (client.id === id) {
        NotificationService.sendEvent(client.client, 'RefreshSpotifyAuth');
      }
    }
  }
  async scanCompleteEvent(id: string, library: MediaLibrary) {
    for (const client of this.clients) {
      if (client.id === id) {
        NotificationService.sendEvent(client.client, 'LibraryScanComplete', {
          id: library.id,
          path: library.path,
        });
      }
    }
  }
}
