import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createSign } from 'node:crypto';

export interface PushPayload {
  title: string;
  body: string;
  data: Record<string, string>;
}

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
  token_uri?: string;
}

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(private readonly config: ConfigService) {}

  async send(tokens: readonly string[], payload: PushPayload): Promise<void> {
    if (tokens.length === 0 || this.config.getOrThrow<string>('PUSH_PROVIDER') === 'none') return;

    try {
      const account = this.parseServiceAccount();
      const accessToken = await this.createAccessToken(account);
      await Promise.all(
        tokens.map(async (token) => {
          const response = await fetch(
            `https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`,
            {
              method: 'POST',
              headers: {
                authorization: `Bearer ${accessToken}`,
                'content-type': 'application/json',
              },
              body: JSON.stringify({ message: { token, notification: payload, data: payload.data } }),
            },
          );
          if (!response.ok) throw new Error(`FCM returned ${response.status}`);
        }),
      );
    } catch (error) {
      this.logger.warn(
        `Push delivery failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private parseServiceAccount(): ServiceAccount {
    const raw = this.config.getOrThrow<string>('FCM_SERVICE_ACCOUNT_JSON');
    const value = JSON.parse(raw) as Partial<ServiceAccount>;
    if (!value.client_email || !value.private_key || !value.project_id) {
      throw new Error('FCM service account is incomplete');
    }
    return value as ServiceAccount;
  }

  private async createAccessToken(account: ServiceAccount): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const assertion = `${base64Url({ alg: 'RS256', typ: 'JWT' })}.${base64Url({
      iss: account.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: account.token_uri ?? 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    })}`;
    const signer = createSign('RSA-SHA256');
    signer.update(assertion);
    const jwt = `${assertion}.${signer.sign(account.private_key, 'base64url')}`;
    const response = await fetch(account.token_uri ?? 'https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
    });
    if (!response.ok) throw new Error(`Google OAuth returned ${response.status}`);
    const result = (await response.json()) as { access_token?: unknown };
    if (typeof result.access_token !== 'string') throw new Error('Google OAuth omitted access_token');
    return result.access_token;
  }
}

function base64Url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}
