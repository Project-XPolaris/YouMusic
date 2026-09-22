import * as fs from 'fs';
import type { AxiosRequestConfig } from 'axios';

const HTTP_PROXY_JSON = '/etc/polaris/http-proxy.json';

type HttpProxyFile = {
  enabled?: boolean;
  url?: string;
};

function readConfiguredProxyUrl(): string | undefined {
  try {
    const raw = fs.readFileSync(HTTP_PROXY_JSON, 'utf8');
    const cfg = JSON.parse(raw) as HttpProxyFile;
    if (cfg?.enabled === false) {
      return undefined;
    }
    if (cfg?.enabled && typeof cfg.url === 'string' && cfg.url.trim()) {
      return cfg.url.trim();
    }
  } catch {
    // fall through to process env
  }
  const fromEnv =
    process.env.HTTPS_PROXY ||
    process.env.HTTP_PROXY ||
    process.env.https_proxy ||
    process.env.http_proxy;
  return fromEnv?.trim() || undefined;
}

/**
 * Axios proxy for OpenAI / Gemini. Ollama stays local and must not use this.
 * Built-in axios proxy only supports http/https (Clash mixed port).
 */
export function outboundAxiosConfig(): Pick<AxiosRequestConfig, 'proxy'> {
  const raw = readConfiguredProxyUrl();
  if (!raw) {
    return {};
  }
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return {};
    }
    const port = u.port
      ? Number(u.port)
      : u.protocol === 'https:'
        ? 443
        : 80;
    if (!Number.isFinite(port) || port <= 0) {
      return {};
    }
    return {
      proxy: {
        protocol: u.protocol.replace(':', ''),
        host: u.hostname,
        port,
        ...(u.username
          ? {
              auth: {
                username: decodeURIComponent(u.username),
                password: decodeURIComponent(u.password),
              },
            }
          : {}),
      },
    };
  } catch {
    return {};
  }
}
