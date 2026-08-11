export const ACCEPTED_DOCUMENT_CONTENT_TYPES = ['application/pdf'] as const;
export type AcceptedDocumentContentType = (typeof ACCEPTED_DOCUMENT_CONTENT_TYPES)[number];
export const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024;

export function isAcceptedDocumentContentType(value: string | null): value is AcceptedDocumentContentType {
  return value !== null && ACCEPTED_DOCUMENT_CONTENT_TYPES.includes(value as AcceptedDocumentContentType);
}
