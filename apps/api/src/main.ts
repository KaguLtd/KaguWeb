import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

function isAllowedWebOrigin(origin: string, configuredOrigin: string) {
  if (origin === configuredOrigin) {
    return true;
  }

  const localOrigins = new Set(["http://localhost:3000", "http://127.0.0.1:3000"]);
  if (localOrigins.has(origin)) {
    return true;
  }

  return /^http:\/\/(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}):3000$/u.test(
    origin
  );
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const configuredOrigin = configService.getOrThrow<string>("WEB_ORIGIN");
  const port = Number(configService.getOrThrow<string>("PORT"));

  app.setGlobalPrefix("api");
  app.enableCors({
    origin(origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) {
      if (!origin || isAllowedWebOrigin(origin, configuredOrigin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`Origin not allowed: ${origin}`), false);
    },
    credentials: true
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true
    })
  );

  await app.listen(port);
}

bootstrap();
