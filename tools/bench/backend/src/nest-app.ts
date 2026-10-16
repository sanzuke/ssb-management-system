import 'reflect-metadata';
import { BadRequestException, Body, Controller, Get, HttpCode, Injectable, Module, Post } from '@nestjs/common';
import { z } from 'zod';

const Echo = z.object({ name: z.string().min(1), age: z.number().int().min(0) });

@Injectable()
export class PingService {
  ping() {
    return { ok: true };
  }
}

@Controller()
export class AppController {
  constructor(private readonly svc: PingService) {}

  @Get('ping')
  ping() {
    return this.svc.ping();
  }

  @Post('echo')
  @HttpCode(200)
  echo(@Body() body: unknown) {
    const r = Echo.safeParse(body);
    if (!r.success) throw new BadRequestException(r.error.issues);
    return r.data;
  }
}

@Module({ controllers: [AppController], providers: [PingService] })
export class AppModule {}
