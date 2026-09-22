import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { errorHandler } from '../error';
import { InternalTokenGuard } from '../internal/internal.guard';
import { publicUid } from '../vars';
import { TaskErrors, TaskService } from '../task/task.service';
import { LibraryService } from './library.service';

@Controller('internal/libraries')
@UseGuards(InternalTokenGuard)
export class InternalLibraryController {
  constructor(
    private readonly libraryService: LibraryService,
    private readonly taskService: TaskService,
  ) {}

  @Get()
  async list() {
    const libraries = await this.libraryService.listAllInternal();
    return { success: true, data: libraries };
  }

  @Post(':id/scan')
  async scan(@Param('id') id: number) {
    const library = await this.libraryService.findOneWithUsers(+id);
    if (!library) {
      throw new HttpException(
        { success: false, reason: 'library not found' },
        HttpStatus.NOT_FOUND,
      );
    }
    const owner =
      (library.users || []).find((u) => u.uid && u.uid !== publicUid)?.uid ||
      publicUid;
    try {
      await this.taskService.newScanTask(+id, owner, false, {});
    } catch (e) {
      errorHandler(e, {
        [TaskErrors.LibraryNotFound]: HttpStatus.NOT_FOUND,
        [TaskErrors.OnlyOneTask]: HttpStatus.CONFLICT,
      });
    }
    return { success: true };
  }
}
