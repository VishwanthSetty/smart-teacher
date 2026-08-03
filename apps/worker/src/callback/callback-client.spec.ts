import { CallbackClient, CallbackRejectedError, CallbackUnavailableError } from './callback-client';
import {
  SIGNATURE_FIXTURE,
  signWorkerPayload,
  WORKER_NONCE_HEADER,
  WORKER_SIGNATURE_HEADER,
  WORKER_TIMESTAMP_HEADER,
} from './signature';

const URL = 'http://api:4000/internal/transcode/callback';
const SECRET = 'worker-callback-secret-for-unit-tests-0123';

describe('CallbackClient', () => {
  let fetchMock: jest.Mock;
  let client: CallbackClient;

  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    global.fetch = fetchMock as unknown as typeof fetch;
    client = new CallbackClient(URL, SECRET);
  });

  const started = { videoId: 'vid_1', attempt: 1, result: 'started' } as const;

  // The signature must cover exactly the bytes sent. If the client signed a
  // re-serialisation, key order could differ and every callback would 401 in production
  // while passing any test that compared objects rather than strings.
  it('signs the exact bytes it sends', async () => {
    await client.send(started);

    const [, init] = fetchMock.mock.calls[0];
    const headers = init.headers as Record<string, string>;
    const expected = signWorkerPayload(
      SECRET,
      headers[WORKER_TIMESTAMP_HEADER],
      headers[WORKER_NONCE_HEADER],
      init.body as string,
    );

    expect(headers[WORKER_SIGNATURE_HEADER]).toBe(`sha256=${expected}`);
    expect(init.body).toBe(JSON.stringify(started));
  });

  it('sends a fresh nonce on every request', async () => {
    await client.send(started);
    await client.send(started);

    const nonces = fetchMock.mock.calls.map(
      ([, init]) => (init.headers as Record<string, string>)[WORKER_NONCE_HEADER],
    );
    expect(nonces[0]).not.toBe(nonces[1]);
  });

  it('resolves on 200', async () => {
    await expect(client.send(started)).resolves.toBeUndefined();
  });

  // 4xx means retrying cannot help: the video is gone, or this attempt was superseded.
  it.each([400, 401, 404, 409])('treats %d as terminal', async (status) => {
    fetchMock.mockResolvedValue({ ok: false, status });
    await expect(client.send(started)).rejects.toBeInstanceOf(CallbackRejectedError);
  });

  it.each([500, 502, 503])('treats %d as retryable', async (status) => {
    fetchMock.mockResolvedValue({ ok: false, status });
    await expect(client.send(started)).rejects.toBeInstanceOf(CallbackUnavailableError);
  });

  it('treats a transport failure as retryable', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(client.send(started)).rejects.toBeInstanceOf(CallbackUnavailableError);
  });
});

// Guards the wire format itself. The identical literal is asserted in
// apps/api/src/auth/guards/worker-auth.guard.spec.ts, so a change to canonicalisation on
// either side fails a spec instead of silently 401ing every callback in production.
describe('worker signature fixture', () => {
  it('matches the canonical `${timestamp}.${nonce}.${rawBody}` construction', () => {
    expect(
      signWorkerPayload(
        SIGNATURE_FIXTURE.secret,
        SIGNATURE_FIXTURE.timestamp,
        SIGNATURE_FIXTURE.nonce,
        SIGNATURE_FIXTURE.body,
      ),
    ).toBe(SIGNATURE_FIXTURE.expected);
  });
});
