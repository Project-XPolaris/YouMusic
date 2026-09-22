import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { LibraryService } from './library.service';
import { CreateLibraryDto } from './dto/create-library.dto';
import * as path from 'path';
import { errorHandler } from '../error';
import { TaskErrors, TaskService } from '../task/task.service';
import { NotificationService } from '../notification/notification.service';
import { getOrderFromQueryString } from '../utils/query';
import { MediaLibrary } from '../database/entites/library';
import { MeilisearchService } from '../meilisearch/meilisearch.service';
import { AudioEmbedService } from '../audioembed/audioembed.service';

@Controller('library')
export class LibraryController {
  constructor(
    private readonly libraryService: LibraryService,
    private readonly taskService: TaskService,
    private readonly notificationService: NotificationService,
    private readonly meili: MeilisearchService,
    private readonly audioEmbedService: AudioEmbedService,
  ) {}

  @Post()
  async create(
    @Body() createLibraryDto: CreateLibraryDto,
    @Req() req: Request & { uid: string; token: string },
  ) {
    return await this.libraryService.create(
      createLibraryDto,
      req.uid,
      req.token,
    );
  }

  @Get()
  async findAll(
    @Query('page') page = 1,
    @Query('pageSize') pageSize = 20,
    @Query('search') search: string | undefined,
    @Query('order') order = '',
    @Req() req: Request & { uid: string },
  ) {
    const [data, count] = await this.libraryService.findAll(
      {
        page: Number(page),
        pageSize: Number(pageSize),
        search,
        order: getOrderFromQueryString(order, {
          allowField: ['id', 'path', 'createdAt', 'updatedAt'],
        }),
      },
      req.uid,
    );
    return {
      count,
      data: data.map((it) => {
        const row = it as MediaLibrary & { musicCount?: number };
        return {
          id: row.id,
          path: row.path,
          name: path.basename(row.path),
          musicCount: row.musicCount ?? 0,
          clapScan: row.clapScan !== false,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        };
      }),
    };
  }

  @Get(':id')
  async findOne(
    @Param('id') id: number,
    @Req() req: Request & { uid: string },
  ) {
    const isAccessible = await this.libraryService.checkAccessible(id, req.uid);
    if (!isAccessible) {
      return {
        success: false,
        reason: 'library not accessible',
      };
    }
    const detail = await this.libraryService.findOneDetail(+id);
    if (!detail) {
      return {
        success: false,
        reason: 'library not found',
      };
    }
    return detail;
  }

  @Put(':id')
  async update(
    @Param('id') id: number,
    @Body() body: { clapScan?: boolean },
    @Req() req: Request & { uid: string },
  ) {
    const isAccessible = await this.libraryService.checkAccessible(id, req.uid);
    if (!isAccessible) {
      return {
        success: false,
        reason: 'library not accessible',
      };
    }
    if (typeof body?.clapScan !== 'boolean') {
      return {
        success: false,
        reason: 'clapScan required',
      };
    }
    const data = await this.libraryService.updateClapScan(+id, body.clapScan);
    return { success: true, data };
  }

  @Delete(':id')
  async remove(@Param('id') id: number, @Req() req: Request & { uid: string }) {
    const isAccessible = await this.libraryService.checkAccessible(id, req.uid);
    if (!isAccessible) {
      return {
        success: false,
        reason: 'library not accessible',
      };
    }
    await this.libraryService.remove(+id);
    return {
      result: 'success',
    };
  }

  @Post(':id/scan')
  async scanLibrary(
    @Param('id') id: number,
    @Query('force_thumbnail') forceThumbnail = '0',
    @Req() req: Request & { uid: string; nid: string },
  ) {
    const isAccessible = await this.libraryService.checkAccessible(id, req.uid);
    if (!isAccessible) {
      return {
        success: false,
        reason: 'library not accessible',
      };
    }
    try {
      await this.taskService.newScanTask(id, req.uid, forceThumbnail === '1', {
        onComplete: (library) => {
          this.notificationService.scanCompleteEvent(req.nid, library);
        },
      });
    } catch (e) {
      errorHandler(e, {
        [TaskErrors.LibraryNotFound]: HttpStatus.NOT_FOUND,
        [TaskErrors.OnlyOneTask]: HttpStatus.BAD_REQUEST,
      });
    }
    return {
      result: 'success',
    };
  }

  @Post(':id/scan/cancel')
  async cancelScanLibrary(
    @Param('id') id: number,
    @Req() req: Request & { uid: string },
  ) {
    const isAccessible = await this.libraryService.checkAccessible(id, req.uid);
    if (!isAccessible) {
      return {
        success: false,
        reason: 'library not accessible',
      };
    }
    
    const cancelled = this.taskService.cancelTask(id);
    return {
      result: cancelled ? 'success' : 'no_running_task',
    };
  }

  @Put(':id/syncindex')
  async syncIndex(
    @Param('id') id: number,
    @Req() req: Request & { uid: string },
  ) {
    const isAccessible = await this.libraryService.checkAccessible(id, req.uid);
    if (!isAccessible) {
      return {
        success: false,
        reason: 'library not accessible',
      };
    }
    if (!this.meili.enable) {
      return {
        success: false,
        reason: 'meilisearch not enabled',
      };
    }
    try {
      await this.meili.syncLibrary(+id);
      return { success: true, result: 'success' };
    } catch (e) {
      return {
        success: false,
        reason: (e as Error).message,
      };
    }
  }

  @Post(':id/tag')
  async tagLibrary(
    @Param('id') id: number,
    @Req() req: Request & { uid: string },
    @Body() body: { threshold?: number } = {},
  ) {
    const isAccessible = await this.libraryService.checkAccessible(id, req.uid);
    if (!isAccessible) {
      return {
        success: false,
        reason: 'library not accessible',
      };
    }
    const task = await this.audioEmbedService.startTagTask({
      libraryId: +id,
      threshold: body?.threshold,
    });
    return { success: true, data: task };
  }

  @Post(':id/tag/clear')
  async clearLibraryTags(
    @Param('id') id: number,
    @Req() req: Request & { uid: string },
  ) {
    const isAccessible = await this.libraryService.checkAccessible(id, req.uid);
    if (!isAccessible) {
      return {
        success: false,
        reason: 'library not accessible',
      };
    }
    const data = await this.audioEmbedService.clearTags({ libraryId: +id });
    return { success: true, data };
  }
}
