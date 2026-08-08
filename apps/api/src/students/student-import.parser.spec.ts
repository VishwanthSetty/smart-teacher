import { BadRequestException } from '@nestjs/common';
import { parseStudentCsv } from './student-import.parser';
import { MAX_IMPORT_ROWS } from './student-import.constants';

function csv(...lines: string[]): Buffer {
  return Buffer.from(lines.join('\n'), 'utf8');
}

const HEADER = 'first_name,last_name,email,grade_level,section,roll_number';

describe('parseStudentCsv', () => {
  describe('file shape', () => {
    it('strips the BOM Excel writes so the first header is still findable', () => {
      const buffer = Buffer.concat([
        Buffer.from([0xef, 0xbb, 0xbf]),
        csv(HEADER, 'Asha,Rao,asha@example.com,Grade 5,A,12'),
      ]);

      const result = parseStudentCsv(buffer);

      expect(result.rowErrors).toEqual([]);
      expect(result.rows[0].email).toBe('asha@example.com');
    });

    it('accepts reordered columns', () => {
      const result = parseStudentCsv(
        csv(
          'email,grade_level,section,first_name,last_name,roll_number',
          'asha@example.com,Grade 5,A,Asha,Rao,12',
        ),
      );

      expect(result.rowErrors).toEqual([]);
      expect(result.rows[0]).toMatchObject({ email: 'asha@example.com', firstName: 'Asha', lastName: 'Rao' });
    });

    it('accepts headers that differ only by case, spacing or hyphens', () => {
      const result = parseStudentCsv(
        csv(
          ' Email ,First Name,Last Name,Grade-Level,SECTION,Roll Number',
          'asha@example.com,Asha,Rao,Grade 5,A,12',
        ),
      );

      expect(result.warnings).toEqual([]);
      expect(result.rowErrors).toEqual([]);
      expect(result.rows[0]).toMatchObject({ email: 'asha@example.com' });
    });

    it('ignores extra columns but reports them as a warning', () => {
      const result = parseStudentCsv(
        csv(`${HEADER},phone`, 'Asha,Rao,asha@example.com,Grade 5,A,12,555'),
      );

      expect(result.rowErrors).toEqual([]);
      expect(result.warnings).toEqual([
        { code: 'EXTRA_COLUMNS', message: 'Ignored unrecognised column(s): phone.' },
      ]);
    });

    it('drops trailing blank rows rather than counting them as data', () => {
      const result = parseStudentCsv(
        csv(HEADER, 'Asha,Rao,asha@example.com,Grade 5,A,12', ',,,,,', '', ',,,,,'),
      );

      expect(result.totalRows).toBe(1);
      expect(result.rowErrors).toEqual([]);
    });

    it('handles CRLF line endings and quoted commas', () => {
      const result = parseStudentCsv(
        Buffer.from(`${HEADER}\r\nAsha,Rao,asha@example.com,"Grade 5",A,12\r\n`, 'utf8'),
      );

      expect(result.rows[0].gradeLevel).toBe('Grade 5');
    });

    it('treats a blank roll_number cell as valid and stores it as null', () => {
      const result = parseStudentCsv(csv(HEADER, 'Asha,Rao,asha@example.com,Grade 5,A,'));

      expect(result.rowErrors).toEqual([]);
      expect(result.rows[0].rollNumber).toBeNull();
    });

    it('accepts a short row when only optional placement columns are absent', () => {
      const result = parseStudentCsv(
        csv(HEADER, 'Asha,Rao,asha@example.com', 'Ravi,Kumar,ravi@example.com,Grade 6,Blue,'),
      );

      expect(result.rows).toHaveLength(2);
      expect(result.rows.map((row) => row.email)).toEqual(['asha@example.com', 'ravi@example.com']);
      expect(result.rowErrors).toEqual([]);
    });
  });

  describe('whole-file rejections', () => {
    it('rejects an empty file', () => {
      expect(() => parseStudentCsv(Buffer.alloc(0))).toThrow(BadRequestException);
    });

    it('rejects a file with headers but no data rows', () => {
      expect(() => parseStudentCsv(csv(HEADER))).toThrow('The uploaded file has no data rows.');
    });

    it('names the missing column when a required header is absent', () => {
      expect(() =>
        parseStudentCsv(csv('first_name,email,grade_level,section', 'Asha,a@example.com,Grade 5,A')),
      ).toThrow(/Missing required column\(s\): last_name/);
    });

    it('rejects a file over the row limit and states both counts', () => {
      const rows = Array.from(
        { length: MAX_IMPORT_ROWS + 1 },
        (_, index) => `Student,${index},s${index}@example.com,Grade 5,A,`,
      );

      expect(() => parseStudentCsv(csv(HEADER, ...rows))).toThrow(/2,001 rows.*limit is 2,000 rows/s);
    });
  });

  describe('row validation', () => {
    it('accepts a student without grade level or section', () => {
      const result = parseStudentCsv(csv(HEADER, 'Asha,Rao,asha@example.com,,,'));

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toMatchObject({ gradeLevel: '', section: '', rollNumber: null });
      expect(result.rowErrors).toEqual([]);
    });

    it('rejects partial placement details', () => {
      const result = parseStudentCsv(csv(HEADER, 'Asha,Rao,asha@example.com,Grade 5,,12'));

      expect(result.rowErrors[0].errors).toContainEqual(expect.objectContaining({ code: 'MISSING_SECTION' }));
    });

    it('collects every applicable reason for a row, not just the first', () => {
      const result = parseStudentCsv(csv(HEADER, 'Asha,,not-an-email,,,'));

      expect(result.rowErrors[0].errors.map((issue) => issue.code)).toEqual([
        'INVALID_EMAIL',
        'MISSING_LAST_NAME',
      ]);
    });

    it('flags a missing email', () => {
      const result = parseStudentCsv(csv(HEADER, ',Rao,,Grade 5,A,'));

      expect(result.rowErrors[0].errors.map((issue) => issue.code)).toContain('MISSING_EMAIL');
    });

    it('flags a first name over the length limit', () => {
      const result = parseStudentCsv(
        csv(HEADER, `${'x'.repeat(61)},Rao,a@example.com,Grade 5,A,`),
      );

      expect(result.rowErrors[0].errors[0].code).toBe('FIRST_NAME_TOO_LONG');
    });

    it('flags a roll number over the length limit', () => {
      const result = parseStudentCsv(
        csv(HEADER, `Asha,Rao,a@example.com,Grade 5,A,${'1'.repeat(21)}`),
      );

      expect(result.rowErrors[0].errors[0].code).toBe('ROLL_NUMBER_TOO_LONG');
    });

    it('keeps the first occurrence of an email and flags later ones, naming the original row', () => {
      const result = parseStudentCsv(
        csv(
          HEADER,
          'Asha,Rao,asha@example.com,Grade 5,A,12',
          'Asha,Rao2,ASHA@example.com,Grade 5,B,13',
        ),
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].rowNumber).toBe(2);
      expect(result.rowErrors[0]).toMatchObject({ rowNumber: 3 });
      expect(result.rowErrors[0].errors[0]).toEqual({
        code: 'DUPLICATE_IN_FILE',
        message: 'Duplicate of row 2 in this file.',
      });
    });

    it('flags a duplicate roll number within the same class in the same file', () => {
      const result = parseStudentCsv(
        csv(
          HEADER,
          'Asha,Rao,asha@example.com,Grade 5,A,12',
          'Ravi,Kumar,ravi@example.com,Grade 5,A,12',
        ),
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rowErrors[0].errors[0]).toEqual({
        code: 'DUPLICATE_ROLL_IN_FILE',
        message: 'Roll number 12 is already used by row 2 in this file.',
      });
    });

    it('does not treat two blank roll numbers as a collision', () => {
      const result = parseStudentCsv(
        csv(
          HEADER,
          'Asha,Rao,asha@example.com,Grade 5,A,',
          'Ravi,Kumar,ravi@example.com,Grade 5,A,',
        ),
      );

      expect(result.rows).toHaveLength(2);
      expect(result.rowErrors).toEqual([]);
    });

    it('does not collide the same roll number across different sections', () => {
      const result = parseStudentCsv(
        csv(
          HEADER,
          'Asha,Rao,asha@example.com,Grade 5,A,12',
          'Ravi,Kumar,ravi@example.com,Grade 5,B,12',
        ),
      );

      expect(result.rows).toHaveLength(2);
      expect(result.rowErrors).toEqual([]);
    });

    it('reports row numbers matching the file lines when blank lines are interleaved', () => {
      const result = parseStudentCsv(csv(HEADER, ',,,,,', 'Asha,Rao,asha@example.com,Grade 5,A,12'));

      expect(result.rows[0].rowNumber).toBe(3);
    });

    it('generates a password when the CSV cell is blank', () => {
      const result = parseStudentCsv(
        csv('first_name,last_name,email,grade_level,section,roll_number,password', 'Asha,Rao,asha@example.com,Grade 5,A,12,'),
      );
      expect(result.rows[0].password).toBe('');
      expect(result.rowErrors).toEqual([]);
    });

    it('rejects a row whose password matches its email', () => {
      const result = parseStudentCsv(
        csv('first_name,last_name,email,grade_level,section,roll_number,password', 'Asha,Rao,asha@example.com,Grade 5,A,12,ASHA@example.com'),
      );
      expect(result.rowErrors[0].errors).toContainEqual(expect.objectContaining({ code: 'PASSWORD_MATCHES_EMAIL' }));
    });
  });
});
