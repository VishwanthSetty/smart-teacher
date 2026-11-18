'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  BulkContentKind,
  type BulkContentConfirmResult,
  type BulkContentCreateResult,
  type ConfirmBulkContentInput,
  type CreateBulkContentInput,
} from '@smart-teacher/shared-types';
import { uploadWithProgress } from '../../_components/upload-with-progress';
import { classifyFile, fileKey, titleFromFileName } from './bulk-upload-files';

const UPLOAD_CONCURRENCY = 3;

// Records are created a few at a time as uploads free up, not all when the operator presses
// start. Closing the tab midway then strands a handful of UPLOADING rows in the library
// rather than one for every file still waiting.
const TICKET_BATCH_SIZE = 6;

// A presigned URL only has to be valid when the PUT starts. The margin covers the time
// between checking it and the request reaching the bucket.
const TICKET_EXPIRY_MARGIN_MS = 60_000;

export type BulkRowStatus = 'pending' | 'preparing' | 'uploading' | 'confirming' | 'done' | 'failed';

export interface BulkDestination {
  contentNodeId: string;
  label: string;
}

export interface BulkRow {
  key: string;
  file: File;
  kind: BulkContentKind;
  contentType: string;
  title: string;
  destination: BulkDestination | null;
  status: BulkRowStatus;
  percent: number;
  error: string | null;
  recordId: string | null;
  ticket: { url: string; expiresAt: number } | null;
  // Set once the bytes are in storage, so retrying a failed confirmation does not upload again.
  isUploaded: boolean;
}

export interface SkippedFile {
  name: string;
  reason: string;
}

export function canStart(row: BulkRow): boolean {
  return row.status === 'pending' && row.destination !== null && row.title.trim() !== '';
}

function expiresAt(expiresInSecs: number): number {
  return Date.now() + expiresInSecs * 1000;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const failure = await response.json().catch(() => ({}));
    throw new Error(failure.message ?? 'The request failed. Try again.');
  }
  return (await response.json()) as T;
}

function basePathFor(kind: BulkContentKind): string {
  return kind === BulkContentKind.VIDEO ? '/api/videos' : '/api/documents';
}

export interface BulkUploadQueue {
  rows: BulkRow[];
  isRunning: boolean;
  addFiles: (files: File[], destination: BulkDestination | null) => SkippedFile[];
  setTitle: (key: string, title: string) => void;
  setDestination: (keys: string[], destination: BulkDestination) => void;
  start: () => void;
  cancel: () => void;
  retry: (keys: string[]) => void;
  remove: (key: string) => Promise<void>;
  clearFinished: () => void;
}

export function useBulkUploadQueue(): BulkUploadQueue {
  const router = useRouter();
  const [rows, setRows] = useState<BulkRow[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  // The workers run outside React's render cycle and must read the latest rows, so the ref
  // holds the truth and the state mirrors it for rendering.
  const rowsRef = useRef<BulkRow[]>([]);
  const isRunningRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const ticketRequests = useRef(new Map<string, Promise<void>>());

  const commit = useCallback((next: BulkRow[]) => {
    rowsRef.current = next;
    setRows(next);
  }, []);

  const patch = useCallback(
    (key: string, changes: Partial<BulkRow>) => {
      commit(rowsRef.current.map((row) => (row.key === key ? { ...row, ...changes } : row)));
    },
    [commit],
  );

  const findRow = useCallback((key: string) => rowsRef.current.find((row) => row.key === key), []);

  const requestTickets = useCallback(
    async (batch: BulkRow[]) => {
      const destinationOf = (row: BulkRow) => row.destination?.contentNodeId ?? '';
      try {
        const result = await postJson<BulkContentCreateResult>('/api/content/bulk', {
          items: batch.map((row) => ({
            kind: row.kind,
            title: row.title.trim(),
            contentNodeId: destinationOf(row),
            contentType: row.contentType,
            sizeBytes: row.file.size,
          })),
        } satisfies CreateBulkContentInput);

        for (const item of result.items) {
          const row = batch[item.index];
          if (item.ok && item.id && item.uploadUrl && item.expiresInSecs) {
            patch(row.key, {
              recordId: item.id,
              ticket: { url: item.uploadUrl, expiresAt: expiresAt(item.expiresInSecs) },
            });
          } else {
            patch(row.key, {
              status: 'failed',
              error: item.error ?? 'This file could not be prepared.',
            });
          }
        }
      } catch (cause) {
        const error = cause instanceof Error ? cause.message : 'The uploads could not be prepared.';
        for (const row of batch) patch(row.key, { status: 'failed', error });
      }
    },
    [patch],
  );

  // A row may already be part of another worker's in-flight batch. It must wait for that
  // batch rather than request a second record for the same file.
  const ensureRecord = useCallback(
    async (key: string) => {
      const row = findRow(key);
      if (!row || row.recordId) return;

      const inFlight = ticketRequests.current.get(key);
      if (inFlight) {
        await inFlight;
        return;
      }

      const others = rowsRef.current
        .filter(
          (other) =>
            other.key !== key &&
            canStart(other) &&
            other.recordId === null &&
            !ticketRequests.current.has(other.key),
        )
        .slice(0, TICKET_BATCH_SIZE - 1);
      const batch = [row, ...others];

      const request = requestTickets(batch).finally(() => {
        for (const member of batch) ticketRequests.current.delete(member.key);
      });
      for (const member of batch) ticketRequests.current.set(member.key, request);
      await request;
    },
    [findRow, requestTickets],
  );

  const freshUploadUrl = useCallback(
    async (row: BulkRow, recordId: string): Promise<string> => {
      if (row.ticket && Date.now() < row.ticket.expiresAt - TICKET_EXPIRY_MARGIN_MS) {
        return row.ticket.url;
      }
      // A ticket can go stale while it waits behind slow uploads, and a retry has none at all.
      const ticket = await postJson<{ uploadUrl: string; expiresInSecs: number }>(
        `${basePathFor(row.kind)}/${recordId}/upload-url`,
        { contentType: row.contentType, sizeBytes: row.file.size },
      );
      return ticket.uploadUrl;
    },
    [],
  );

  const confirmRow = useCallback(
    async (row: BulkRow, recordId: string) => {
      patch(row.key, { status: 'confirming', percent: 100 });
      const result = await postJson<BulkContentConfirmResult>('/api/content/bulk/confirm', {
        items: [{ kind: row.kind, id: recordId }],
      } satisfies ConfirmBulkContentInput);
      const [outcome] = result.items;

      if (outcome?.ok) {
        patch(row.key, { status: 'done', ticket: null });
        return;
      }
      // The API read the stored object and refused it, so only a new upload can fix this.
      patch(row.key, {
        status: 'failed',
        error: outcome?.error ?? 'The uploaded file could not be verified.',
        isUploaded: false,
        ticket: null,
      });
    },
    [patch],
  );

  const processRow = useCallback(
    async (key: string, signal: AbortSignal) => {
      try {
        await ensureRecord(key);
        const prepared = findRow(key);
        if (!prepared || prepared.status === 'failed' || !prepared.recordId) return;
        const { recordId } = prepared;

        if (!prepared.isUploaded) {
          const url = await freshUploadUrl(prepared, recordId);
          // Checked here because an AbortSignal that has already fired never notifies
          // uploadWithProgress, which would then send the whole file anyway.
          if (signal.aborted) {
            patch(key, { status: 'pending', percent: 0 });
            return;
          }
          patch(key, { status: 'uploading', percent: 0 });
          let lastPercent = 0;
          await uploadWithProgress({
            url,
            file: prepared.file,
            contentType: prepared.contentType,
            signal,
            onProgress: ({ percent }) => {
              if (percent === lastPercent) return;
              lastPercent = percent;
              patch(key, { percent });
            },
          });
          patch(key, { isUploaded: true, ticket: null });
        }

        await confirmRow(prepared, recordId);
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === 'AbortError') {
          patch(key, { status: 'pending', percent: 0, ticket: null });
          return;
        }
        patch(key, {
          status: 'failed',
          error: cause instanceof Error ? cause.message : 'Upload failed. Try again.',
        });
      }
    },
    [confirmRow, ensureRecord, findRow, freshUploadUrl, patch],
  );

  const runWorker = useCallback(
    async (signal: AbortSignal) => {
      while (!signal.aborted) {
        const next = rowsRef.current.find(canStart);
        if (!next) return;
        // Claimed synchronously, before any await, so two workers can never take one row.
        patch(next.key, { status: 'preparing', percent: 0, error: null });
        await processRow(next.key, signal);
      }
    },
    [patch, processRow],
  );

  const start = useCallback(() => {
    if (isRunningRef.current) return;
    isRunningRef.current = true;
    setIsRunning(true);

    const controller = new AbortController();
    abortRef.current = controller;

    const workers = Array.from({ length: UPLOAD_CONCURRENCY }, () => runWorker(controller.signal));
    void Promise.all(workers).then(() => {
      isRunningRef.current = false;
      abortRef.current = null;
      setIsRunning(false);
      // Next caches the library page on the client, and it should show the new rows.
      router.refresh();
    });
  }, [router, runWorker]);

  const cancel = useCallback(() => abortRef.current?.abort(), []);

  const retry = useCallback(
    (keys: string[]) => {
      const wanted = new Set(keys);
      commit(
        rowsRef.current.map((row) =>
          wanted.has(row.key) && row.status === 'failed'
            ? { ...row, status: 'pending' as const, error: null, percent: 0 }
            : row,
        ),
      );
      start();
    },
    [commit, start],
  );

  const addFiles = useCallback(
    (files: File[], destination: BulkDestination | null): SkippedFile[] => {
      const skipped: SkippedFile[] = [];
      const known = new Set(rowsRef.current.map((row) => row.key));
      const added: BulkRow[] = [];

      for (const file of files) {
        const key = fileKey(file);
        if (known.has(key)) {
          skipped.push({ name: file.name, reason: 'already in the list' });
          continue;
        }
        const classified = classifyFile(file);
        if (!classified.isAccepted) {
          skipped.push({ name: file.name, reason: classified.reason });
          continue;
        }
        known.add(key);
        added.push({
          key,
          file,
          kind: classified.kind,
          contentType: classified.contentType,
          title: titleFromFileName(file.name),
          destination,
          status: 'pending',
          percent: 0,
          error: null,
          recordId: null,
          ticket: null,
          isUploaded: false,
        });
      }

      commit([...rowsRef.current, ...added]);
      return skipped;
    },
    [commit],
  );

  const setTitle = useCallback((key: string, title: string) => patch(key, { title }), [patch]);

  // Rows with a record keep their destination: it is already stored on that record.
  const setDestination = useCallback(
    (keys: string[], destination: BulkDestination) => {
      const wanted = new Set(keys);
      commit(
        rowsRef.current.map((row) =>
          wanted.has(row.key) && row.recordId === null ? { ...row, destination } : row,
        ),
      );
    },
    [commit],
  );

  const remove = useCallback(
    async (key: string) => {
      const row = findRow(key);
      if (!row) return;
      if (row.recordId) {
        const response = await fetch(`${basePathFor(row.kind)}/${row.recordId}`, { method: 'DELETE' });
        if (!response.ok && response.status !== 404) {
          const failure = await response.json().catch(() => ({}));
          patch(key, { error: failure.message ?? 'This file could not be removed.' });
          return;
        }
      }
      commit(rowsRef.current.filter((candidate) => candidate.key !== key));
    },
    [commit, findRow, patch],
  );

  // Only takes finished rows off this list. The uploaded content stays in the library.
  const clearFinished = useCallback(() => {
    commit(rowsRef.current.filter((row) => row.status !== 'done'));
  }, [commit]);

  useEffect(() => {
    if (!isRunning) return undefined;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [isRunning]);

  useEffect(() => () => abortRef.current?.abort(), []);

  return {
    rows,
    isRunning,
    addFiles,
    setTitle,
    setDestination,
    start,
    cancel,
    retry,
    remove,
    clearFinished,
  };
}
