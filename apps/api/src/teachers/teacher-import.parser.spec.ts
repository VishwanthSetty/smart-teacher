import { BadRequestException } from '@nestjs/common';
import { parseTeacherCsv } from './teacher-import.parser';
import { MAX_IMPORT_ROWS } from './teacher-import.constants';

function csv(...lines: string[]): Buffer {
  return Buffer.from(lines.join('\n'), 'utf8');
}

const HEADER = 'email,name,subject_codes';

describe('parseTeacherCsv', () => {
  describe('file shape', () => {
    it('strips the BOM Excel writes so the first header is still findable', () => {
      const buffer = Buffer.concat([
        Buffer.from([0xef, 0xbb, 0xbf]),
        csv(HEADER, 'asha@example.com,Asha Rao,maths'),
      ]);

      const result = parseTeacherCsv(buffer);

      expect(result.rowErrors).toEqual([]);
      expect(result.rows[0].email).toBe('asha@example.com');
    });

    it('accepts reordered columns', () => {
      const result = parseTeacherCsv(csv('name,subject_codes,email', 'Asha Rao,maths,asha@example.com'));

      expect(result.rowErrors).toEqual([]);
      expect(result.rows[0]).toMatchObject({ email: 'asha@example.com', name: 'Asha Rao' });
    });

    it('accepts headers that differ only by case, spacing or hyphens', () => {
      const result = parseTeacherCsv(
        csv(' Email , NAME ,Subject Codes', 'asha@example.com,Asha Rao,maths'),
      );

      expect(result.warnings).toEqual([]);
      expect(result.rowErrors).toEqual([]);
      expect(result.rows[0]).toMatchObject({ email: 'asha@example.com', name: 'Asha Rao' });
    });

    it('ignores extra columns but reports them as a warning', () => {
      const result = parseTeacherCsv(
        csv(`${HEADER},phone,department`, 'asha@example.com,Asha Rao,maths,555,Science'),
      );

      expect(result.rowErrors).toEqual([]);
      expect(result.warnings).toEqual([
        { code: 'EXTRA_COLUMNS', message: 'Ignored unrecognised column(s): phone, department.' },
      ]);
    });

    it('drops trailing blank rows rather than counting them as data', () => {
      const result = parseTeacherCsv(csv(HEADER, 'asha@example.com,Asha Rao,maths', ',,', '', ',,'));

      expect(result.totalRows).toBe(1);
      expect(result.rowErrors).toEqual([]);
    });

    it('handles CRLF line endings and quoted commas in subject_codes', () => {
      const result = parseTeacherCsv(
        Buffer.from(`${HEADER}\r\nasha@example.com,Asha Rao,"maths, science"\r\n`, 'utf8'),
      );

      expect(result.rows[0].subjectCodes).toEqual(['maths', 'science']);
    });

    it('de-duplicates repeated subject codes within one row', () => {
      const result = parseTeacherCsv(csv(HEADER, 'asha@example.com,Asha Rao,"maths,MATHS, maths"'));

      expect(result.rows[0].subjectCodes).toEqual(['maths']);
    });

    it('treats a blank subject_codes cell as valid', () => {
      const result = parseTeacherCsv(csv(HEADER, 'asha@example.com,Asha Rao,'));

      expect(result.rowErrors).toEqual([]);
      expect(result.rows[0].subjectCodes).toEqual([]);
    });

    it('accepts the optional grade_level column and preserves legacy files without it', () => {
      const graded = parseTeacherCsv(
        csv('email,name,grade_level,subject_codes', 'asha@example.com,Asha Rao,Grade 5,maths'),
      );
      const legacy = parseTeacherCsv(csv(HEADER, 'ravi@example.com,Ravi K,science'));

      expect(graded.rows[0].gradeLevelName).toBe('Grade 5');
      expect(legacy.rows[0].gradeLevelName).toBe('');
    });

    it('reports a short row as a row error rather than aborting the file', () => {
      const result = parseTeacherCsv(csv(HEADER, 'asha@example.com', 'ravi@example.com,Ravi K,maths'));

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].email).toBe('ravi@example.com');
      expect(result.rowErrors[0].errors.map((issue) => issue.code)).toEqual(['MISSING_NAME']);
    });
  });

  describe('whole-file rejections', () => {
    it('rejects an empty file', () => {
      expect(() => parseTeacherCsv(Buffer.alloc(0))).toThrow(BadRequestException);
    });

    it('rejects a file with headers but no data rows', () => {
      expect(() => parseTeacherCsv(csv(HEADER))).toThrow('The uploaded file has no data rows.');
    });

    it('names the missing column when a required header is absent', () => {
      expect(() => parseTeacherCsv(csv('email,subject_codes', 'a@example.com,maths'))).toThrow(
        /Missing required column\(s\): name/,
      );
    });

    it('rejects a file over the row limit and states both counts', () => {
      const rows = Array.from(
        { length: MAX_IMPORT_ROWS + 1 },
        (_, index) => `t${index}@example.com,Teacher ${index},maths`,
      );

      expect(() => parseTeacherCsv(csv(HEADER, ...rows))).toThrow(/2,001 rows.*limit is 2,000 rows/s);
    });
  });

  describe('row validation', () => {
    it('collects every applicable reason for a row, not just the first', () => {
      const result = parseTeacherCsv(csv(HEADER, 'not-an-email,,maths'));

      expect(result.rowErrors[0].errors.map((issue) => issue.code)).toEqual([
        'INVALID_EMAIL',
        'MISSING_NAME',
      ]);
    });

    it('flags a missing email', () => {
      const result = parseTeacherCsv(csv(HEADER, ',Asha Rao,maths'));

      expect(result.rowErrors[0].errors[0].code).toBe('MISSING_EMAIL');
    });

    it('flags a name over the length limit', () => {
      const result = parseTeacherCsv(csv(HEADER, `a@example.com,${'x'.repeat(121)},maths`));

      expect(result.rowErrors[0].errors[0].code).toBe('NAME_TOO_LONG');
    });

    it('keeps the first occurrence of an email and flags later ones, naming the original row', () => {
      const result = parseTeacherCsv(
        csv(HEADER, 'asha@example.com,Asha Rao,maths', 'ASHA@example.com,Asha R,science'),
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].rowNumber).toBe(2);
      expect(result.rowErrors[0]).toMatchObject({ rowNumber: 3 });
      expect(result.rowErrors[0].errors[0]).toEqual({
        code: 'DUPLICATE_IN_FILE',
        message: 'Duplicate of row 2 in this file.',
      });
    });

    it('reports row numbers matching the file lines when blank lines are interleaved', () => {
      const result = parseTeacherCsv(csv(HEADER, ',,', 'asha@example.com,Asha Rao,maths'));

      expect(result.rows[0].rowNumber).toBe(3);
    });

    it('generates a password when the CSV cell is blank', () => {
      const result = parseTeacherCsv(csv('email,name,subject_codes,password', 'asha@example.com,Asha Rao,maths,'));
      expect(result.rows[0].password).toBe('');
      expect(result.rowErrors).toEqual([]);
    });

    it('rejects a row whose password matches its email', () => {
      const result = parseTeacherCsv(
        csv('email,name,subject_codes,password', 'asha@example.com,Asha Rao,maths,ASHA@example.com'),
      );
      expect(result.rowErrors[0].errors).toContainEqual(expect.objectContaining({ code: 'PASSWORD_MATCHES_EMAIL' }));
    });
  });
});
