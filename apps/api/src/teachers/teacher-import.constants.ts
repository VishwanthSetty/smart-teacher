// Product rules, not deployment config — deliberately constants rather than env vars,
// so there is one answer to "what does the template look like" across the parser, the
// template endpoint and the error report.

export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;

export const MAX_IMPORT_ROWS = 2000;

// The exact headers the downloadable template carries, in order. The parser matches
// against these after normalisation, so a reordered or differently-cased file still works.
export const IMPORT_TEMPLATE_HEADERS = ['email', 'name', 'subject_codes', 'password'] as const;

// `subject_codes` may be blank — a teacher can be imported before their subjects are known.
export const REQUIRED_HEADERS = ['email', 'name'] as const;

export const MAX_NAME_LENGTH = 120;
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
export const UTF8_BOM = '\uFEFF';
