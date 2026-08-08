// Product rules, not deployment config — deliberately constants rather than env vars,
// so there is one answer to "what does the template look like" across the parser, the
// template endpoint and the error report.

export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;

export const MAX_IMPORT_ROWS = 2000;

// The exact headers the downloadable template carries, in order. The parser matches
// against these after normalisation, so a reordered or differently-cased file still works.
export const IMPORT_TEMPLATE_HEADERS = [
  'first_name',
  'last_name',
  'email',
  'grade_level',
  'section',
  'roll_number',
  'password',
] as const;

// `roll_number` may be blank — a school may not track roll numbers for every class.
export const REQUIRED_HEADERS = ['first_name', 'last_name', 'email'] as const;

// Matches CreateStudentDto's @MaxLength(60) on firstName/lastName.
export const MAX_NAME_PART_LENGTH = 60;

// Matches CreateStudentDto's @MaxLength(20) on rollNumber.
export const MAX_ROLL_NUMBER_LENGTH = 20;
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 72;

// A DRAFT batch is a staging artefact for one admin's upload→confirm round trip. Pruned
// opportunistically on the next upload rather than by a cron, matching LoginThrottleService.
export const DRAFT_BATCH_TTL_MS = 24 * 60 * 60 * 1000;

// Chunk size for the createManyAndReturn calls inside the import transaction. Keeps a
// 2000-row import to ten statements rather than one oversized parameter list.
export const CREATE_CHUNK_SIZE = 200;

// Excel only auto-detects UTF-8 in a CSV when it starts with a BOM, so every file we
// hand back gets one — the same BOM the parser strips on the way in.
export const UTF8_BOM = '﻿';
