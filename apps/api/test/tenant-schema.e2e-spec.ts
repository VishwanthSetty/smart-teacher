import { INestApplication } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { TENANT_SCOPED_MODELS } from '../src/prisma/tenant-scoped-models';
import { createE2eApp } from './utils/e2e-app';

interface ColumnRow {
  table_name: string;
  column_name: string;
  is_nullable: 'YES' | 'NO';
}

interface ForeignKeyRow {
  table_name: string;
  column_name: string;
  foreign_table_name: string;
}

// F-02 acceptance criterion 4: "Every tenant-scoped table has a NOT NULL + FK constraint
// on school_id." Asserted against the live database rather than the Prisma schema, so a
// migration that drifts from schema.prisma is caught too.
//
// User is the one exception: SUPER_ADMIN is a platform user belonging to no tenant, so
// its schoolId must stay nullable. Any *other* tenant table that forgets NOT NULL fails.
const NULLABLE_SCHOOL_ID_EXCEPTIONS: Record<string, string> = {
  User: 'SUPER_ADMIN is a platform user with no school; a null schoolId is the platform scope',
};

describe('Tenant schema constraints (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let columns: ColumnRow[];
  let foreignKeys: ForeignKeyRow[];

  // Model and column names are read back from the DMMF rather than hardcoded, so adding
  // @map to a future model doesn't quietly make this test assert against nothing.
  function tableNameOf(model: string): string {
    const dmmfModel = Prisma.dmmf.datamodel.models.find((candidate) => candidate.name === model);
    if (!dmmfModel) {
      throw new Error(`Model "${model}" is in TENANT_SCOPED_MODELS but absent from the schema`);
    }
    return dmmfModel.dbName ?? dmmfModel.name;
  }

  function schoolIdColumnOf(model: string): string {
    const dmmfModel = Prisma.dmmf.datamodel.models.find((candidate) => candidate.name === model);
    const field = dmmfModel?.fields.find((candidate) => candidate.name === 'schoolId');
    if (!field) {
      throw new Error(`Model "${model}" is in TENANT_SCOPED_MODELS but has no schoolId field`);
    }
    return field.dbName ?? field.name;
  }

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);

    columns = await prisma.$queryRaw<ColumnRow[]>`
      SELECT table_name, column_name, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
    `;

    foreignKeys = await prisma.$queryRaw<ForeignKeyRow[]>`
      SELECT tc.table_name, kcu.column_name, ccu.table_name AS foreign_table_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
    `;
  });

  afterAll(async () => {
    await app.close();
  });

  it.each(TENANT_SCOPED_MODELS)('%s.schoolId is NOT NULL, unless documented otherwise', (model) => {
    const table = tableNameOf(model);
    const column = columns.find(
      (row) => row.table_name === table && row.column_name === schoolIdColumnOf(model),
    );

    expect(column).toBeDefined();
    const expected = model in NULLABLE_SCHOOL_ID_EXCEPTIONS ? 'YES' : 'NO';
    expect(column?.is_nullable).toBe(expected);
  });

  it.each(TENANT_SCOPED_MODELS)('%s.schoolId has a foreign key to School', (model) => {
    const table = tableNameOf(model);
    const column = schoolIdColumnOf(model);

    const foreignKey = foreignKeys.find((row) => row.table_name === table && row.column_name === column);

    expect(foreignKey).toBeDefined();
    expect(foreignKey?.foreign_table_name).toBe('School');
  });

  it('documents an exception only for models that really are nullable', () => {
    for (const model of Object.keys(NULLABLE_SCHOOL_ID_EXCEPTIONS)) {
      expect(TENANT_SCOPED_MODELS as readonly string[]).toContain(model);
    }
  });
});
