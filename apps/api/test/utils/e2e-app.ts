import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModuleBuilder } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';

// The bootstrap sequence every existing e2e spec hand-rolls (Test.createTestingModule ->
// createNestApplication -> useGlobalPipes -> init). Existing specs are left as-is to keep
// this ticket's diff reviewable; new specs should use this instead of a sixth copy.
export interface CreateE2eAppOptions {
  imports?: NonNullable<Parameters<typeof Test.createTestingModule>[0]>['imports'];
  overrideProviders?: (builder: TestingModuleBuilder) => TestingModuleBuilder;
}

export async function createE2eApp(options: CreateE2eAppOptions = {}): Promise<INestApplication> {
  let builder = Test.createTestingModule({
    imports: [AppModule, ...(options.imports ?? [])],
  });

  if (options.overrideProviders) {
    builder = options.overrideProviders(builder);
  }

  const moduleFixture = await builder.compile();

  const app = moduleFixture.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.init();

  return app;
}
