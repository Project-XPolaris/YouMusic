import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  NotFoundException,
} from '@nestjs/common';
import { LlmService } from './llm.service';

@Controller('llm')
export class LlmController {
  constructor(private readonly llmService: LlmService) {}

  @Get('config')
  getConfig() {
    return this.llmService.getSafeConfig();
  }

  @Put('config')
  updateConfig(@Body() body: any) {
    return this.llmService.updateAndSave(body, body?.persist !== false);
  }

  @Post('config/reload')
  reload() {
    return this.llmService.reloadFromDisk();
  }

  @Post('config/save')
  save() {
    // config already persisted on PUT when persist=true
    return { success: true, message: 'ok' };
  }

  @Get('status')
  status() {
    return {
      available: this.llmService.isEnabled(),
      providers: this.llmService.getAvailableProviders(),
      default: this.llmService.getSafeConfig().default,
    };
  }

  @Post('test')
  async test(@Body() body: { provider?: string; prompt?: string }) {
    const prompt =
      body?.prompt ||
      "Hello, this is a test message. Please respond with 'Test successful'.";
    try {
      const response = await this.llmService.generateText(
        prompt,
        body?.provider,
      );
      return {
        success: true,
        prompt,
        response,
        response_length: response.length,
      };
    } catch (e: any) {
      return {
        success: false,
        prompt,
        error: String(e?.message || e),
      };
    }
  }

  @Get('template/types')
  templateTypes() {
    return { data: this.llmService.listTemplateTypes() };
  }

  @Get('templates')
  async templates() {
    return { data: await this.llmService.listTemplates() };
  }

  @Get('templates/:id')
  async template(@Param('id') id: string) {
    const t = await this.llmService.getTemplate(+id);
    if (!t) throw new NotFoundException();
    return t;
  }

  @Put('templates/:id')
  async updateTemplate(@Param('id') id: string, @Body() body: any) {
    const t = await this.llmService.updateTemplate(+id, body);
    if (!t) throw new NotFoundException();
    return t;
  }
}
