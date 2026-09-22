import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import axios from 'axios';
import { LlmTemplate } from '../database/entites/llm-template';
import { outboundAxiosConfig } from '../utils/outbound-proxy';
import {
  persistYamlObjectSection,
  resolveYouMusicConfigPath,
} from '../utils/yaml-config';
import * as fs from 'fs';
import * as yaml from 'js-yaml';

export const TEMPLATE_TYPE_MUSIC_SEMANTIC_REWRITE = 'music_semantic_rewrite';
export const DEFAULT_MUSIC_SEMANTIC_REWRITE_NAME = 'music_semantic_rewrite';

const DEFAULT_REWRITE_PROMPT = `You rewrite music search queries for CLAP audio-text embeddings.

User query:
{{query}}

Rules:
- Output ONE short English acoustic/mood description (style, instruments, tempo, energy, scene).
- NEVER leave a one-word genre as-is. Expand "rock"/"摇滚" into e.g. "rock music, electric guitar, drums, energetic band".
- If the user mentions artist names or song titles, KEEP them in the output (do not drop them).
- Prefer concrete music words (electric guitar, drums, britpop, acoustic folk, hard rock riff, ballad, male vocal).
- Chinese or other languages → translate into concise English acoustic wording; keep proper nouns.
- If already a good English acoustic phrase, light polish only.
- Do NOT explain. No quotes or markdown. Reply with the rewritten query only.`;

export type QueryRewriteResult = {
  original: string;
  rewritten: string;
  rewrote: boolean;
};

type LLMRuntimeConfig = {
  enable: boolean;
  default: string;
  openai?: {
    enable: boolean;
    model: string;
    base_url?: string;
    api_key?: string;
  };
  ollama?: {
    enable: boolean;
    base_url: string;
    model: string;
  };
  gemini?: {
    enable: boolean;
    model: string;
    api_key?: string;
    location?: string;
    project?: string;
  };
};

@Injectable()
export class LlmService implements OnModuleInit {
  private readonly logger = new Logger(LlmService.name);
  private runtime: LLMRuntimeConfig;

  constructor(
    private configService: ConfigService,
    private dataSource: DataSource,
  ) {
    this.runtime = this.readConfigFromYaml();
  }

  async onModuleInit() {
    await this.initDefaultTemplates();
  }

  private parseBool(v: unknown, fallback = false): boolean {
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v !== 0;
    if (typeof v === 'string') {
      const s = v.trim().toLowerCase();
      if (['1', 'true', 'yes', 'on'].includes(s)) return true;
      if (['0', 'false', 'no', 'off', ''].includes(s)) return false;
    }
    return fallback;
  }

  private readConfigFromYaml(): LLMRuntimeConfig {
    const llm = (this.configService.get('llm') as LLMRuntimeConfig) || {
      enable: false,
      default: 'openai',
    };
    return {
      enable: this.parseBool(llm.enable),
      default: llm.default || 'openai',
      openai: llm.openai,
      ollama: llm.ollama,
      gemini: llm.gemini,
    };
  }

  reloadFromDisk() {
    try {
      const p = resolveYouMusicConfigPath();
      const doc = yaml.load(fs.readFileSync(p, 'utf8')) as Record<string, any>;
      this.runtime = {
        enable: this.parseBool(doc?.llm?.enable),
        default: doc?.llm?.default || 'openai',
        openai: doc?.llm?.openai,
        ollama: doc?.llm?.ollama,
        gemini: doc?.llm?.gemini,
      };
    } catch (e) {
      this.logger.warn(`reload llm config failed: ${e}`);
    }
    return this.getSafeConfig();
  }

  isEnabled(): boolean {
    return Boolean(this.runtime?.enable);
  }

  getSafeConfig() {
    return {
      enable: this.runtime.enable,
      default: this.runtime.default,
      openai: this.runtime.openai
        ? {
            enable: Boolean(this.runtime.openai.enable),
            model: this.runtime.openai.model || 'gpt-4o-mini',
            base_url:
              this.runtime.openai.base_url || 'https://api.openai.com/v1',
            has_key: Boolean(this.runtime.openai.api_key),
          }
        : undefined,
      ollama: this.runtime.ollama
        ? {
            enable: Boolean(this.runtime.ollama.enable),
            base_url: this.runtime.ollama.base_url || 'http://127.0.0.1:11434',
            model: this.runtime.ollama.model || 'llama3.2',
          }
        : undefined,
      gemini: this.runtime.gemini
        ? {
            enable: Boolean(this.runtime.gemini.enable),
            model: this.runtime.gemini.model || 'gemini-1.5-flash',
            location: this.runtime.gemini.location,
            project: this.runtime.gemini.project,
            has_key: Boolean(this.runtime.gemini.api_key),
          }
        : undefined,
    };
  }

  getAvailableProviders(): string[] {
    const out: string[] = [];
    if (this.runtime.openai?.enable && this.runtime.openai?.api_key) {
      out.push('openai');
    }
    if (this.runtime.ollama?.enable) {
      out.push('ollama');
    }
    if (this.runtime.gemini?.enable && this.runtime.gemini?.api_key) {
      out.push('gemini');
    }
    return out;
  }

  updateAndSave(body: any, persist = true) {
    const next: LLMRuntimeConfig = {
      enable: this.parseBool(body.enable),
      default: body.default || this.runtime.default || 'openai',
      openai: body.openai
        ? {
            enable: this.parseBool(body.openai.enable),
            model: body.openai.model || 'gpt-4o-mini',
            base_url: body.openai.base_url || 'https://api.openai.com/v1',
            api_key:
              body.openai.api_key || this.runtime.openai?.api_key || undefined,
          }
        : this.runtime.openai,
      ollama: body.ollama
        ? {
            enable: this.parseBool(body.ollama.enable),
            base_url: body.ollama.base_url || 'http://127.0.0.1:11434',
            model: body.ollama.model || 'llama3.2',
          }
        : this.runtime.ollama,
      gemini: body.gemini
        ? {
            enable: this.parseBool(body.gemini.enable),
            model: body.gemini.model || 'gemini-1.5-flash',
            api_key:
              body.gemini.api_key || this.runtime.gemini?.api_key || undefined,
            location: body.gemini.location,
            project: body.gemini.project,
          }
        : this.runtime.gemini,
    };
    this.runtime = next;
    if (persist) {
      persistYamlObjectSection('llm', next as any);
    }
    return this.getSafeConfig();
  }

  async generateText(prompt: string, provider?: string): Promise<string> {
    if (!this.runtime.enable) {
      throw new Error('llm is disabled');
    }
    const p = provider || this.runtime.default || 'openai';
    if (p === 'openai') {
      return this.generateOpenAI(prompt);
    }
    if (p === 'ollama') {
      return this.generateOllama(prompt);
    }
    if (p === 'gemini') {
      return this.generateGemini(prompt);
    }
    throw new Error(`unknown provider: ${p}`);
  }

  private async generateOpenAI(prompt: string): Promise<string> {
    const cfg = this.runtime.openai;
    if (!cfg?.enable || !cfg.api_key) {
      throw new Error('openai not configured');
    }
    const base = (cfg.base_url || 'https://api.openai.com/v1').replace(
      /\/$/,
      '',
    );
    const { data } = await axios.post(
      `${base}/chat/completions`,
      {
        model: cfg.model || 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
      },
      {
        headers: {
          Authorization: `Bearer ${cfg.api_key}`,
          'Content-Type': 'application/json',
        },
        timeout: 60000,
        ...outboundAxiosConfig(),
      },
    );
    return String(data?.choices?.[0]?.message?.content || '').trim();
  }

  private async generateOllama(prompt: string): Promise<string> {
    const cfg = this.runtime.ollama;
    if (!cfg?.enable) {
      throw new Error('ollama not configured');
    }
    const base = (cfg.base_url || 'http://127.0.0.1:11434').replace(/\/$/, '');
    const { data } = await axios.post(
      `${base}/api/chat`,
      {
        model: cfg.model || 'llama3.2',
        stream: false,
        messages: [{ role: 'user', content: prompt }],
      },
      { timeout: 60000 },
    );
    return String(data?.message?.content || '').trim();
  }

  private async generateGemini(prompt: string): Promise<string> {
    const cfg = this.runtime.gemini;
    if (!cfg?.enable || !cfg.api_key) {
      throw new Error('gemini not configured');
    }
    const model = cfg.model || 'gemini-1.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(
      cfg.api_key,
    )}`;
    const { data } = await axios.post(
      url,
      {
        contents: [{ parts: [{ text: prompt }] }],
      },
      { timeout: 60000, ...outboundAxiosConfig() },
    );
    const text =
      data?.candidates?.[0]?.content?.parts
        ?.map((p: any) => p.text)
        .filter(Boolean)
        .join('') || '';
    return String(text).trim();
  }

  async initDefaultTemplates() {
    const repo = this.dataSource.getRepository(LlmTemplate);
    const existing = await repo.findOne({
      where: { name: DEFAULT_MUSIC_SEMANTIC_REWRITE_NAME },
    });
    if (!existing) {
      await repo.save(
        repo.create({
          name: DEFAULT_MUSIC_SEMANTIC_REWRITE_NAME,
          type: TEMPLATE_TYPE_MUSIC_SEMANTIC_REWRITE,
          description:
            '音乐语义搜索：将用户查询改写成 CLAP 友好的英文声学描述',
          content: DEFAULT_REWRITE_PROMPT,
          isDefault: true,
          version: '1.0',
        }),
      );
      this.logger.log('seeded music_semantic_rewrite template');
    }
  }

  async getRewritePrompt(): Promise<string> {
    const repo = this.dataSource.getRepository(LlmTemplate);
    const t = await repo.findOne({
      where: { name: DEFAULT_MUSIC_SEMANTIC_REWRITE_NAME },
    });
    if (!t?.content) {
      return DEFAULT_REWRITE_PROMPT;
    }
    t.lastUsedAt = new Date();
    await repo.save(t);
    return t.content;
  }

  listTemplateTypes() {
    return [
      {
        value: TEMPLATE_TYPE_MUSIC_SEMANTIC_REWRITE,
        label: '语义搜索改写',
        description:
          '将用户查询改写成 CLAP 友好的英文声学描述（占位符 {{query}}）',
      },
    ];
  }

  async listTemplates() {
    return this.dataSource.getRepository(LlmTemplate).find({
      order: { id: 'ASC' },
    });
  }

  async getTemplate(id: number) {
    return this.dataSource.getRepository(LlmTemplate).findOne({ where: { id } });
  }

  async updateTemplate(id: number, body: Partial<LlmTemplate>) {
    const repo = this.dataSource.getRepository(LlmTemplate);
    const t = await repo.findOne({ where: { id } });
    if (!t) {
      return null;
    }
    if (body.content !== undefined) t.content = body.content;
    if (body.description !== undefined) t.description = body.description;
    if (body.name !== undefined) t.name = body.name;
    return repo.save(t);
  }

  shouldRewriteSemanticQuery(requestOverride?: boolean | null): boolean {
    if (requestOverride !== undefined && requestOverride !== null) {
      return Boolean(requestOverride);
    }
    const v = this.configService.get('audioembed.semantic_rewrite');
    if (v === undefined || v === null) return true;
    return Boolean(v);
  }

  async rewriteSemanticQuery(
    query: string,
    timeoutMs = 12000,
  ): Promise<QueryRewriteResult> {
    const q = (query || '').trim();
    const out: QueryRewriteResult = {
      original: q,
      rewritten: q,
      rewrote: false,
    };
    if (!q || !this.isEnabled()) {
      return out;
    }
    try {
      const tmpl = await this.getRewritePrompt();
      const prompt = tmpl.split('{{query}}').join(q);
      const reply = await Promise.race([
        this.generateText(prompt),
        new Promise<string>((_, reject) =>
          setTimeout(() => reject(new Error('llm rewrite timeout')), timeoutMs),
        ),
      ]);
      const rewritten = cleanRewriteReply(reply);
      if (!rewritten || rewritten.toLowerCase() === q.toLowerCase()) {
        return out;
      }
      out.rewritten = rewritten;
      out.rewrote = true;
      this.logger.log(`semantic rewrite: "${q}" -> "${rewritten}"`);
      return out;
    } catch (e) {
      this.logger.warn(`semantic rewrite failed; using original: ${e}`);
      return out;
    }
  }
}

export function cleanRewriteReply(raw: string): string {
  let s = (raw || '').trim().replace(/^["'`]+|["'`]+$/g, '');
  for (const line of s.split('\n')) {
    let lineTrim = line.trim().replace(/^["'`]+|["'`]+$/g, '');
    lineTrim = lineTrim.replace(/^Rewritten:\s*/i, '').trim();
    if (lineTrim) {
      const runes = Array.from(lineTrim);
      if (runes.length > 200) {
        return runes.slice(0, 200).join('');
      }
      return lineTrim;
    }
  }
  return '';
}
