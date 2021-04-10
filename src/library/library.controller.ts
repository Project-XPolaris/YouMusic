import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { LibraryService } from './library.service';
import { CreateLibraryDto } from './dto/create-library.dto';
import * as path from 'path';
import { errorHandler } from '../error';
import { TaskErrors, TaskService } from '../task/task.service';
import { NotificationService } from '../notification/notification.service';

@Controller('library')
export class LibraryController {
  constructor(
    private readonly libraryService: LibraryService,
    private readonly taskService: TaskService,
    private readonly notificationService: NotificationService,
  ) {}

  @Post()
  async create(
    @Body() createLibraryDto: CreateLibraryDto,
    @Req() req: Request & { uid: string },
  ) {
    return await this.libraryService.create(createLibraryDto, req.uid);
  }

  @Get()
  async findAll(
    @Query('page') page = 1,
    @Query('pageSize') pageSize = 20,
    @Req() req: Request & { uid: string },
  ) {
    const [data, count] = await this.libraryService.findAll(
      { page, pageSize },
      req.uid,
    );
    return {
      count,
      data: data.map((it) => ({
        ...it,
        name: path.basename(it.path),
      })),
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
    return this.libraryService.findOne(+id);
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
    return this.libraryService.remove(+id);
  }

  @Post(':id/scan')
  async scanLibrary(
    @Param('id') id: number,
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
      await this.taskService.newTask(id, req.uid, {
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
}
