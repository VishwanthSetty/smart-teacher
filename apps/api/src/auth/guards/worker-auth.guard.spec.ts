import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { WorkerAuthGuard } from './worker-auth.guard';
import { SIGNATURE_FIXTURE, signWorkerPayload } from './worker-signature';

const SECRET = 'unit-test-worker-callback-secret-0123456789';
const SKEW_SECS = 300;
const BODY = '{"videoId":"vid_1","result":"succeeded","attempt":1}';
const NONCE = 'ff00ff00ff00ff00';

interface Headers {
  [name: string]: string | undefined;
}

function contextFor(headers: Headers, rawBody: Buffer | undefined): ExecutionContext {
  return {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ headers, rawBody }) }),
  } as unknown as ExecutionContext;
}

function signedHeaders(
  overrides: Partial<{ timestamp: string; nonce: string; body: string; secret: string }> = {},
): Headers {
  const timestamp = overrides.timestamp ?? String(Math.floor(Date.now() / 1000));
  const nonce = overrides.nonce ?? NONCE;
  const digest = signWorkerPayload(
    overrides.secret ?? SECRET,
    timestamp,
    nonce,
    overrides.body ?? BODY,
  );
  return {
    'x-transcode-timestamp': timestamp,
    'x-transcode-nonce': nonce,
    'x-transcode-signature': `sha256=${digest}`,
  };
}

describe('WorkerAuthGuard', () => {
  let guard: WorkerAuthGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn().mockReturnValue(true) } as unknown as Reflector;
    const config = {
      getOrThrow: jest.fn((key: string) =>
        key === 'WORKER_CALLBACK_SECRET' ? SECRET : SKEW_SECS,
      ),
    } as unknown as ConfigService;
    guard = new WorkerAuthGuard(reflector, config);
  });

  it('admits a correctly signed request', () => {
    expect(guard.canActivate(contextFor(signedHeaders(), Buffer.from(BODY)))).toBe(true);
  });

  // The guard runs on every route in the app; on all but one of them it must cost a
  // single metadata lookup and never touch the request at all.
  it('no-ops on a route that is not a worker route, without reading headers', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(false);
    const request = { headers: {}, rawBody: undefined };
    const context = {
      getHandler: () => () => undefined,
      getClass: () => class {},
      switchToHttp: () => ({
        getRequest: () => {
          throw new Error('the guard must not read the request on a non-worker route');
        },
      }),
    } as unknown as ExecutionContext;

    expect(guard.canActivate(context)).toBe(true);
    expect(request.headers).toEqual({});
  });

  it('rejects a request with no signature headers at all', () => {
    expect(() => guard.canActivate(contextFor({}, Buffer.from(BODY)))).toThrow(UnauthorizedException);
  });

  it.each([
    ['timestamp', 'x-transcode-timestamp'],
    ['nonce', 'x-transcode-nonce'],
    ['signature', 'x-transcode-signature'],
  ])('rejects a request missing the %s header', (_label, header) => {
    const headers = signedHeaders();
    delete headers[header];
    expect(() => guard.canActivate(contextFor(headers, Buffer.from(BODY)))).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a signature produced with a different secret', () => {
    const headers = signedHeaders({ secret: 'a-completely-different-secret-value-here' });
    expect(() => guard.canActivate(contextFor(headers, Buffer.from(BODY)))).toThrow(
      UnauthorizedException,
    );
  });

  // The whole point of signing raw bytes: a signature over one payload must not authorise
  // a different one.
  it('rejects a signature computed over a different body than the one sent', () => {
    const headers = signedHeaders({ body: '{"videoId":"vid_1","result":"failed","attempt":1}' });
    expect(() => guard.canActivate(contextFor(headers, Buffer.from(BODY)))).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a timestamp outside the skew window in either direction', () => {
    const now = Math.floor(Date.now() / 1000);
    for (const timestamp of [String(now - SKEW_SECS - 60), String(now + SKEW_SECS + 60)]) {
      const headers = signedHeaders({ timestamp });
      expect(() => guard.canActivate(contextFor(headers, Buffer.from(BODY)))).toThrow(
        UnauthorizedException,
      );
    }
  });

  it('accepts a timestamp inside the skew window in either direction', () => {
    const now = Math.floor(Date.now() / 1000);
    for (const timestamp of [String(now - SKEW_SECS + 30), String(now + SKEW_SECS - 30)]) {
      const headers = signedHeaders({ timestamp });
      expect(guard.canActivate(contextFor(headers, Buffer.from(BODY)))).toBe(true);
    }
  });

  it('rejects a non-numeric timestamp', () => {
    const headers = signedHeaders();
    headers['x-transcode-timestamp'] = 'not-a-timestamp';
    expect(() => guard.canActivate(contextFor(headers, Buffer.from(BODY)))).toThrow(
      UnauthorizedException,
    );
  });

  // timingSafeEqual throws on a length mismatch, so a malformed digest must be rejected by
  // the shape check first — a 500 here would itself be an oracle.
  it.each([
    ['no sha256= prefix', 'a'.repeat(64)],
    ['non-hex characters', `sha256=${'z'.repeat(64)}`],
    ['wrong length', 'sha256=abcdef'],
    ['empty digest', 'sha256='],
  ])('rejects a malformed signature (%s) with 401, not 500', (_label, signature) => {
    const headers = signedHeaders();
    headers['x-transcode-signature'] = signature;
    expect(() => guard.canActivate(contextFor(headers, Buffer.from(BODY)))).toThrow(
      UnauthorizedException,
    );
  });

  // Without rawBody there is nothing to verify against; failing closed is the only safe
  // reading of a misconfigured app (main.ts forgetting `{ rawBody: true }`).
  it('rejects when rawBody is unavailable', () => {
    expect(() => guard.canActivate(contextFor(signedHeaders(), undefined))).toThrow(
      UnauthorizedException,
    );
  });

  it('never says which part of the scheme failed', () => {
    const cases = [{}, signedHeaders({ secret: 'wrong-secret-wrong-secret-wrong-secret' })];
    const messages = cases.map((headers) => {
      try {
        guard.canActivate(contextFor(headers, Buffer.from(BODY)));
        return 'admitted';
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    });

    expect(new Set(messages).size).toBe(1);
    expect(messages[0]).toBe('Worker authentication failed');
  });
});

// Guards the wire format itself. The identical literal is asserted in
// apps/worker/src/callback/signature.spec.ts, so a change to canonicalisation on either
// side fails a spec instead of silently 401ing every callback in production.
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
