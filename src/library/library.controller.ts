import {
  Controller,
  Get,
  Post,
  Body,
  Put,
  Param,
  Delete,
  Query,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { LibraryService } from './library.service';
import { CreateLibraryDto } from './dto/create-library.dto';
import { TaskErrors, TaskPoolInstance } from '../services/task';
import { errorHandler, ServiceError } from '../error';
import * as path from 'path';

@Controller('library')
export class LibraryController {
  constructor(private readonly libraryService: LibraryService) {}

  @Post()
  async create(@Body() createLibraryDto: CreateLibraryDto) {
    return await this.libraryService.create(createLibraryDto);
  }

  @Get()
  async findAll(@Query('page') page = 1, @Query('pageSize') pageSize = 20) {
    const [data, count] = await this.libraryService.findAll({ page, pageSize });
    return {
      count,
      data: data.map((it) => ({
        ...it,
        name: path.basename(it.path),
      })),
    };
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.libraryService.findOne(+id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.libraryService.remove(+id);
  }

  @Post(':id/scan')
  async scanLibrary(@Param('id') id: number) {
    try {
      await TaskPoolInstance.newTask(id);
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
