import {
  BulkContentKind,
  MAX_DOCUMENT_BYTES,
  MAX_VIDEO_BYTES,
} from '@smart-teacher/shared-types';

// Keyed on the extension because browsers report an empty type for some files, .mov on
// Windows in particular. The API still verifies what actually landed in storage.
const TYPES_BY_EXTENSION: Record<string, { kind: BulkContentKind; contentType: string }> = {
  mp4: { kind: BulkContentKind.VIDEO, contentType: 'video/mp4' },
  mov: { kind: BulkContentKind.VIDEO, contentType: 'video/quicktime' },
  pdf: { kind: BulkContentKind.DOCUMENT, contentType: 'application/pdf' },
};

export const ACCEPTED_FILE_INPUT = 'video/mp4,video/quicktime,application/pdf,.mp4,.mov,.pdf';

const MAX_TITLE_LENGTH = 200;

export type ClassifiedFile =
  | { isAccepted: true; kind: BulkContentKind; contentType: string }
  | { isAccepted: false; reason: string };

export function classifyFile(file: File): ClassifiedFile {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  const type = TYPES_BY_EXTENSION[extension];

  if (!type) {
    return { isAccepted: false, reason: 'not an MP4, MOV, or PDF file' };
  }
  if (file.size === 0) {
    return { isAccepted: false, reason: 'the file is empty' };
  }
  if (type.kind === BulkContentKind.VIDEO && file.size > MAX_VIDEO_BYTES) {
    return { isAccepted: false, reason: 'larger than the 2 GB video limit' };
  }
  if (type.kind === BulkContentKind.DOCUMENT && file.size > MAX_DOCUMENT_BYTES) {
    return { isAccepted: false, reason: 'larger than the 50 MB PDF limit' };
  }
  return { isAccepted: true, ...type };
}

export function titleFromFileName(fileName: string): string {
  const title = fileName
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return (title || fileName).slice(0, MAX_TITLE_LENGTH);
}

// Also the row's identity, so adding the same file twice cannot upload it twice.
export function fileKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}
