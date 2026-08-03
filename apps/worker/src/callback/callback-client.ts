import { CallbackPayload } from './callback-payload';
import { signRequest } from './signature';

/**
 * A 4xx from the callback endpoint. The API answers 4xx only when retrying cannot help —
 * the video is gone (404), or this attempt has been superseded or the row is in a state
 * this result no longer applies to (409). The worker stops rather than burning the queue's
 * retry budget on a job nobody wants.
 */
export class CallbackRejectedError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'CallbackRejectedError';
  }
}

/** A 5xx or transport failure: the API is unwell, not the job. Retryable. */
export class CallbackUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CallbackUnavailableError';
  }
}

export class CallbackClient {
  constructor(
    private readonly url: string,
    private readonly secret: string,
  ) {}

  async send(payload: CallbackPayload): Promise<void> {
    // Serialised once, then both signed and sent. Signing a re-serialisation would reorder
    // keys and the API's HMAC over the raw bytes would never match.
    const rawBody = JSON.stringify(payload);

    let response: Response;
    try {
      response = await fetch(this.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...signRequest(this.secret, rawBody) },
        body: rawBody,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new CallbackUnavailableError(`Could not reach the callback endpoint: ${reason}`);
    }

    if (response.ok) {
      return;
    }

    if (response.status >= 400 && response.status < 500) {
      throw new CallbackRejectedError(
        response.status,
        `The API rejected this callback with ${response.status}.`,
      );
    }

    throw new CallbackUnavailableError(`The callback endpoint returned ${response.status}.`);
  }
}
