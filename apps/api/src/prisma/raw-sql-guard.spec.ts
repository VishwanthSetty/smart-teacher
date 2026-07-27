import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const SRC_ROOT = join(__dirname, '..');
const RAW_SQL_METHODS = ['$queryRaw', '$executeRaw', '$queryRawUnsafe', '$executeRawUnsafe'];

// Raw SQL bypasses the tenant guard entirely — it is a Prisma Client extension, and
// `$queryRaw` never reaches the client's query API. Until Postgres RLS lands (F-02b)
// there is no second line of defence, so raw SQL against a tenant-scoped table would be
// an unguarded cross-tenant read with nothing to catch it.
//
// Each allowed file needs a reason. `apps/api` has no ESLint config, so this is a test
// rather than a lint rule.
const ALLOWED: Record<string, string> = {
  [join('health', 'prisma-health.indicator.ts')]: 'SELECT 1 liveness probe — touches no table',
};

function tsFilesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      return tsFilesUnder(full);
    }
    return entry.isFile() && entry.name.endsWith('.ts') ? [full] : [];
  });
}

describe('raw SQL guard', () => {
  it('keeps raw SQL out of every file but the documented exceptions', () => {
    const offenders = tsFilesUnder(SRC_ROOT)
      .filter((file) => !file.endsWith('.spec.ts'))
      .filter((file) => {
        const relativePath = relative(SRC_ROOT, file);
        if (relativePath in ALLOWED) {
          return false;
        }
        const source = readFileSync(file, 'utf8');
        // Skip the comments that explain the rule in the guard's own source.
        return RAW_SQL_METHODS.some((method) =>
          source.split('\n').some((line) => !line.trimStart().startsWith('//') && line.includes(method)),
        );
      })
      .map((file) => relative(SRC_ROOT, file).split(sep).join('/'));

    expect(offenders).toEqual([]);
  });

  it('keeps the allow-list honest — every entry still exists and still uses raw SQL', () => {
    for (const allowed of Object.keys(ALLOWED)) {
      const source = readFileSync(join(SRC_ROOT, allowed), 'utf8');
      expect(RAW_SQL_METHODS.some((method) => source.includes(method))).toBe(true);
    }
  });
});
