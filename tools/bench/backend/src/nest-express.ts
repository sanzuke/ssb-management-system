import { NestFactory } from "@nestjs/core";
import { AppModule } from "./nest-app.js";

const app = await NestFactory.create(AppModule, { logger: false });
await app.listen(Number(process.env.PORT ?? 3000), "127.0.0.1");
