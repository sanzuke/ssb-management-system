import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./nest-app.js";

const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: false });
app.set("etag", false);
await app.listen(Number(process.env.PORT ?? 3000), "127.0.0.1");
