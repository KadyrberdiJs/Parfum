import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { setupApp } from './setup-app';
import {
  UPLOADS_DIRECTORY,
  UPLOADS_URL_PREFIX,
} from './modules/image/image-storage';
async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  setupApp(app);
  app.useStaticAssets(UPLOADS_DIRECTORY, { prefix: UPLOADS_URL_PREFIX });
  await app.listen(process.env.PORT ?? 4001);
}
void bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
