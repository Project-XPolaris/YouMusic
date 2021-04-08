import { HttpException, HttpStatus } from '@nestjs/common';

export class ServiceError extends Error {
  constructor(message: string, errorType: string) {
    super(message);
    this.errorType = errorType;
  }
  errorType: string;
}
export const errorHandler = (
  e: Error | ServiceError,
  converter: { [key: string]: number | ((e: ServiceError) => HttpException) },
) => {
  if ('errorType' in e) {
    let handler = converter[e.errorType];
    if (typeof handler === 'number') {
      throw new HttpException(
        {
          success: false,
          type: e.errorType,
          description: e.message,
        },
        handler,
      );
    }
    if (handler === undefined) {
      handler = (e) => {
        return new HttpException(
          {
            success: false,
            type: e.errorType,
            description: e.message,
          },
          HttpStatus.BAD_REQUEST,
        );
      };
    }
    throw handler(e);
  } else {
    throw new HttpException(
      {
        success: false,
        type: 'unknown',
        description: e.message,
      },
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
};
