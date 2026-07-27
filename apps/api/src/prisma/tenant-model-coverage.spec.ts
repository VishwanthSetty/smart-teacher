import { Prisma } from '@prisma/client';
import { PLATFORM_GLOBAL_MODELS, TENANT_SCOPED_MODELS } from './tenant-scoped-models';

type DmmfModel = (typeof Prisma.dmmf.datamodel.models)[number];

// CLAUDE.md asks that a new tenant table be added to TENANT_SCOPED_MODELS "the same day"
// its migration lands, because until then the guard cannot see it. These tests turn that
// rule into a build failure instead of a habit: the schema itself is the source of truth,
// and every model has to be classified one way or the other.
describe('tenant model coverage', () => {
  const models = Prisma.dmmf.datamodel.models;

  function modelNamed(name: string): DmmfModel {
    const model = models.find((candidate) => candidate.name === name);
    if (!model) {
      throw new Error(`Model "${name}" is listed in tenant-scoped-models.ts but absent from the schema`);
    }
    return model;
  }

  function hasSchoolIdColumn(model: DmmfModel): boolean {
    return model.fields.some((field) => field.kind === 'scalar' && field.name === 'schoolId');
  }

  it('registers every model carrying a schoolId column as tenant-scoped', () => {
    const unregistered = models
      .filter((model) => hasSchoolIdColumn(model))
      .map((model) => model.name)
      .filter((name) => !(TENANT_SCOPED_MODELS as readonly string[]).includes(name));

    expect(unregistered).toEqual([]);
  });

  it('lists only models that actually exist and carry a schoolId as tenant-scoped', () => {
    for (const name of TENANT_SCOPED_MODELS) {
      expect(hasSchoolIdColumn(modelNamed(name))).toBe(true);
    }
  });

  it('keeps the platform-global exception free of any tenant column', () => {
    for (const name of PLATFORM_GLOBAL_MODELS) {
      expect(hasSchoolIdColumn(modelNamed(name))).toBe(false);
    }
  });

  it('classifies every model in the schema as tenant-scoped, platform-global, or neither by design', () => {
    // Models that are neither: the tenant root itself, plus infrastructure keyed by user
    // or by nothing at all. Listed here so a *new* model forces a deliberate decision
    // rather than defaulting to "unscoped" by silence.
    const KNOWN_UNSCOPED = ['School', 'RefreshToken', 'LoginAttempt'];
    const classified: string[] = [...TENANT_SCOPED_MODELS, ...PLATFORM_GLOBAL_MODELS, ...KNOWN_UNSCOPED];

    const unclassified = models.map((model) => model.name).filter((name) => !classified.includes(name));

    expect(unclassified).toEqual([]);
  });
});
