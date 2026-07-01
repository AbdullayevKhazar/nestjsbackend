import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { map, Observable } from 'rxjs';

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, unknown> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((response) => {
        const res = context.switchToHttp().getResponse();

        const result: Record<string, unknown> = {
          success: true,
          statusCode: res.statusCode,
          message: response?.message ?? 'Success',
          data: response?.data ?? response ?? null,
        };

        if (response?.meta) {
          result.meta = response.meta;
        }

        return result;
      }),
    );
  }
}
