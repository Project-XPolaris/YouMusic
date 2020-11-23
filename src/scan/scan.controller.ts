import { Body, Controller, Get, Post } from '@nestjs/common';
import { scanFile } from '../services/scan';
import { TaskPoolInstance } from '../services/task';
import { NewTaskDto } from './new-task.dto';

@Controller('scan')
export class ScanController {
  @Post('new')
  async startScan(@Body() newTaskDto: NewTaskDto) {
    // const task = TaskPoolInstance.newTask(newTaskDto.libraryPath);
    // return task;
  }
}
