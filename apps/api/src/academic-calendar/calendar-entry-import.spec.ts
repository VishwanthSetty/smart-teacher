import { BadRequestException, UnprocessableEntityException } from '@nestjs/common';
import { Workbook } from 'exceljs';
import { parseDateOnly } from './academic-calendar-dates.util';
import {
  buildCalendarImportTemplate,
  parseCalendarImport,
  planCalendarImport,
  requireImportable,
} from './calendar-entry-import';

const YEAR = {
  label: '2026-2027',
  startDate: parseDateOnly('2026-06-01'),
  endDate: parseDateOnly('2027-03-31'),
};

async function xlsx(rows: unknown[][]): Promise<{ buffer: Buffer; originalname: string }> {
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet('Lessons');
  rows.forEach((row) => sheet.addRow(row));
  return { buffer: Buffer.from(await workbook.xlsx.writeBuffer()), originalname: 'plan.xlsx' };
}

function csv(text: string): { buffer: Buffer; originalname: string } {
  return { buffer: Buffer.from(text, 'utf8'), originalname: 'plan.csv' };
}

describe('parseCalendarImport', () => {
  it('reads Excel date cells, ISO text and day-first text dates', async () => {
    const file = await xlsx([
      ['Date', 'Lesson', 'Notes'],
      [parseDateOnly('2026-07-01'), 'Place value', 'Bring abacus'],
      ['2026-07-02', 'Rounding', null],
      ['03/07/2026', 'Estimation', ''],
    ]);

    const result = await parseCalendarImport(file, YEAR);

    expect(result.errors).toEqual([]);
    expect(result.rows).toEqual([
      { rowNumber: 2, date: '2026-07-01', title: 'Place value', description: 'Bring abacus' },
      { rowNumber: 3, date: '2026-07-02', title: 'Rounding', description: null },
      { rowNumber: 4, date: '2026-07-03', title: 'Estimation', description: null },
    ]);
  });

  it('finds columns by heading, in any order and case', async () => {
    const file = await xlsx([
      ['NOTES', 'Title', ' date '],
      ['Recap', 'Fractions', '2026-08-10'],
    ]);

    const result = await parseCalendarImport(file, YEAR);

    expect(result.rows).toEqual([{ rowNumber: 2, date: '2026-08-10', title: 'Fractions', description: 'Recap' }]);
  });

  it('reports each bad row with its spreadsheet row number and every problem', async () => {
    const file = await xlsx([
      ['Date', 'Lesson'],
      ['2026-07-01', 'Fine'],
      ['2027-04-01', ''],
      ['31/02/2027', 'Not a real day'],
      ['', 'No date'],
      ['2026-07-01', 'fine'],
    ]);

    const result = await parseCalendarImport(file, YEAR);

    expect(result.rows.map((row) => row.rowNumber)).toEqual([2]);
    expect(result.errors).toEqual([
      {
        rowNumber: 3,
        date: '2027-04-01',
        title: '',
        errors: ['Date is outside academic year 2026-2027', 'Lesson is missing'],
      },
      {
        rowNumber: 4,
        date: '31/02/2027',
        title: 'Not a real day',
        errors: ['Date must be a date, YYYY-MM-DD or DD/MM/YYYY'],
      },
      { rowNumber: 5, date: '', title: 'No date', errors: ['Date is missing'] },
      {
        rowNumber: 6,
        date: '2026-07-01',
        title: 'fine',
        errors: ['Same date and lesson appear earlier in the file'],
      },
    ]);
  });

  it('skips fully blank rows without shifting row numbers', async () => {
    const file = await xlsx([['Date', 'Lesson'], ['2026-07-01', 'One'], [], ['2026-07-03', 'Three']]);

    const result = await parseCalendarImport(file, YEAR);

    expect(result.rows.map((row) => row.rowNumber)).toEqual([2, 4]);
  });

  it('accepts CSV with a byte-order mark', async () => {
    const result = await parseCalendarImport(csv('﻿Date,Lesson,Notes\n2026-07-01,"Fractions, part 1",\n'), YEAR);

    expect(result.rows).toEqual([{ rowNumber: 2, date: '2026-07-01', title: 'Fractions, part 1', description: null }]);
  });

  it('refuses a file without Date and Lesson headings', async () => {
    await expect(parseCalendarImport(csv('When,What\n2026-07-01,x\n'), YEAR)).rejects.toThrow(BadRequestException);
  });

  it('refuses a file type it cannot read', async () => {
    await expect(
      parseCalendarImport({ buffer: Buffer.from('x'), originalname: 'plan.xls' }, YEAR),
    ).rejects.toThrow('Upload an Excel (.xlsx) or CSV file');
  });

  it('refuses a corrupt workbook as a bad request, not a crash', async () => {
    await expect(
      parseCalendarImport({ buffer: Buffer.from('not a zip'), originalname: 'plan.xlsx' }, YEAR),
    ).rejects.toThrow(BadRequestException);
  });

  it('round-trips its own template', async () => {
    const template = await buildCalendarImportTemplate(YEAR);

    const result = await parseCalendarImport({ buffer: template, originalname: 'template.xlsx' }, YEAR);

    expect(result.errors).toEqual([]);
    expect(result.rows).toEqual([expect.objectContaining({ date: '2026-06-01' })]);
  });
});

describe('planCalendarImport', () => {
  const parsed = {
    rows: [
      { rowNumber: 2, date: '2026-07-01', title: 'Place value', description: null },
      { rowNumber: 3, date: '2026-07-02', title: 'Rounding', description: null },
    ],
    errors: [],
  };

  it('skips rows already in the calendar when appending', () => {
    const plan = planCalendarImport(parsed, [{ date: parseDateOnly('2026-07-01'), title: 'place value ' }], false);

    expect(plan.duplicateCount).toBe(1);
    expect(plan.toCreate.map((row) => row.title)).toEqual(['Rounding']);
  });

  it('keeps every row when replacing', () => {
    const plan = planCalendarImport(parsed, [{ date: parseDateOnly('2026-07-01'), title: 'Place value' }], true);

    expect(plan).toEqual({ toCreate: parsed.rows, duplicateCount: 0 });
  });
});

it('refuses to commit a file with any invalid row', () => {
  expect(() =>
    requireImportable({ rows: [], errors: [{ rowNumber: 2, date: '', title: '', errors: ['Date is missing'] }] }),
  ).toThrow(UnprocessableEntityException);
});
