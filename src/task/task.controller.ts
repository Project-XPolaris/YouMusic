import { Controller, Get } from '@nestjs/common';
import { TaskService } from './task.service';

@Controller('/task')
export class TaskController {
  constructor(private taskService: TaskService) {}
  @Get('/')
  async getTaskList() {
    return {
      success: true,
      tasks: this.taskService.tasks,
    };
  }
}
