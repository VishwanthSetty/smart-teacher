import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Auth + RBAC (e2e)', () => {
  let app: INestApplication;
  let adminAccessToken: string;
  let teacherAccessToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('logs in the seeded admin user', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@smartteacher.dev', password: 'Passw0rd!', schoolSlug: 'demo-school' })
      .expect(200);

    expect(response.body.accessToken).toEqual(expect.any(String));
    expect(response.body.refreshToken).toEqual(expect.any(String));
    adminAccessToken = response.body.accessToken;
  });

  it('logs in the seeded teacher user', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'teacher@smartteacher.dev', password: 'Passw0rd!', schoolSlug: 'demo-school' })
      .expect(200);

    teacherAccessToken = response.body.accessToken;
  });

  it('allows ADMIN to list users via GET /admin/users', async () => {
    await request(app.getHttpServer())
      .get('/admin/users')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(200);
  });

  it('forbids TEACHER from GET /admin/users', async () => {
    await request(app.getHttpServer())
      .get('/admin/users')
      .set('Authorization', `Bearer ${teacherAccessToken}`)
      .expect(403);
  });

  it('rejects GET /users/me with no token', async () => {
    await request(app.getHttpServer()).get('/users/me').expect(401);
  });
});
