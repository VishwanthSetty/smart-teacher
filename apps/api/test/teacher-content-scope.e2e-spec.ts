import { INestApplication } from '@nestjs/common';
import { PrismaClient, Role } from '@prisma/client';
import request from 'supertest';
import { createE2eApp } from './utils/e2e-app';
import { seedContentFixtures } from './utils/content-fixtures';
import { loginAllRoles } from './utils/login';

describe('Teacher content scope (e2e)', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let tokens: Record<Role, string>;
  let schoolId: string;
  let teacherId: string;
  let grade5Id: string;
  let mathsId: string;
  let g5MathsCurriculumId: string;
  let g5ScienceCurriculumId: string;
  let g5MathsTeacherCurriculumId: string;

  const get = (path: string, token: string) =>
    request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${token}`);

  const listedIds = async (audience: 'STUDENT' | 'TEACHER'): Promise<string[]> => {
    const response = await get(`/curricula?audience=${audience}`, tokens[Role.TEACHER]).expect(200);
    return response.body.map((row: { id: string }) => row.id);
  };

  beforeAll(async () => {
    const fixtures = await seedContentFixtures();
    schoolId = fixtures.schoolId;
    grade5Id = fixtures.grade5Id;
    mathsId = fixtures.mathsId;
    g5MathsCurriculumId = fixtures.g5MathsCurriculumId;
    g5ScienceCurriculumId = fixtures.g5ScienceCurriculumId;
    g5MathsTeacherCurriculumId = fixtures.g5MathsTeacherCurriculumId;
    const teacher = await prisma.user.findUniqueOrThrow({
      where: {
        schoolId_email: { schoolId, email: 'teacher@smartteacher.dev' },
      },
      select: { id: true },
    });
    teacherId = teacher.id;
    await prisma.teacherAssignment.deleteMany({ where: { schoolId, userId: teacherId } });
    await prisma.schoolContentEntitlement.deleteMany({
      where: { schoolId, curriculumId: g5ScienceCurriculumId },
    });
    app = await createE2eApp();
    tokens = await loginAllRoles(app);
  });

  afterAll(async () => {
    await prisma.teacherAssignment.deleteMany({ where: { schoolId, userId: teacherId } });
    await prisma.schoolContentEntitlement.deleteMany({
      where: { schoolId, curriculumId: g5ScienceCurriculumId },
    });
    await app.close();
    await prisma.$disconnect();
  });

  it('keeps the lenient school-wide fallback until a grade-bearing assignment exists', async () => {
    expect(await listedIds('STUDENT')).toEqual([g5MathsCurriculumId]);

    await prisma.schoolContentEntitlement.create({
      data: { schoolId, curriculumId: g5ScienceCurriculumId },
    });
    expect(await listedIds('STUDENT')).toEqual(
      expect.arrayContaining([g5MathsCurriculumId, g5ScienceCurriculumId]),
    );

    await prisma.teacherAssignment.create({
      data: {
        schoolId,
        userId: teacherId,
        gradeLevelId: grade5Id,
        subjectId: mathsId,
      },
    });
    expect(await listedIds('STUDENT')).toEqual([g5MathsCurriculumId]);
  });

  it('keeps all entitled teacher-audience curricula after assignment narrowing begins', async () => {
    expect(await listedIds('TEACHER')).toEqual([g5MathsTeacherCurriculumId]);
  });

  it('returns no teacher-audience curricula to a student', async () => {
    const response = await get('/curricula?audience=TEACHER', tokens[Role.STUDENT]).expect(200);
    expect(response.body).toEqual([]);
  });
});
