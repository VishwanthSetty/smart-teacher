import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const MAX_FAILED_ATTEMPTS = 20;
const ATTEMPT_WINDOW_MS = 50 * 60_000;

const MAX_RESET_REQUESTS = 5;
const RESET_WINDOW_MS = 60 * 60_000;

// Longest window in use, so the opportunistic prune never removes rows a
// still-active reset or lockout window needs to count.
const PRUNE_WINDOW_MS = Math.max(ATTEMPT_WINDOW_MS, RESET_WINDOW_MS);

const LOCKOUT_MESSAGE = 'Too many failed login attempts. Please try again later.';
const RESET_THROTTLE_MESSAGE = 'Too many password reset requests. Please try again later.';

@Injectable()
export class LoginThrottleService {
  constructor(private readonly prisma: PrismaService) {}

  async assertNotLockedOut(emailKey: string, ip: string): Promise<void> {
    const count = await this.countAttempts(emailKey, ip, ATTEMPT_WINDOW_MS);
    if (count.emailAttempts >= MAX_FAILED_ATTEMPTS || count.ipAttempts >= MAX_FAILED_ATTEMPTS) {
      throw new HttpException(LOCKOUT_MESSAGE, HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  // Reset requests share the LoginAttempt table under a "reset:" key namespace
  // (both the email key and the ip key), so they can never contribute to, or be
  // blocked by, the login lockout counters above.
  async assertResetNotThrottled(emailKey: string, ipKey: string): Promise<void> {
    const count = await this.countAttempts(emailKey, ipKey, RESET_WINDOW_MS);
    if (count.emailAttempts >= MAX_RESET_REQUESTS || count.ipAttempts >= MAX_RESET_REQUESTS) {
      throw new HttpException(RESET_THROTTLE_MESSAGE, HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  async recordFailure(emailKey: string, ip: string): Promise<void> {
    await this.recordAttempt(emailKey, ip);
  }

  async recordAttempt(emailKey: string, ip: string): Promise<void> {
    await this.prisma.loginAttempt.create({ data: { email: emailKey, ipAddress: ip } });
  }

  async clearFailures(emailKey: string): Promise<void> {
    await this.prisma.loginAttempt.deleteMany({ where: { email: emailKey } });
  }

  private async countAttempts(
    emailKey: string,
    ip: string,
    windowMs: number,
  ): Promise<{ emailAttempts: number; ipAttempts: number }> {
    const pruneBefore = new Date(Date.now() - PRUNE_WINDOW_MS);
    // Opportunistic prune: no cron, just clear out stale rows on the busiest path.
    await this.prisma.loginAttempt.deleteMany({ where: { createdAt: { lt: pruneBefore } } });

    const windowStart = new Date(Date.now() - windowMs);
    const [emailAttempts, ipAttempts] = await Promise.all([
      this.prisma.loginAttempt.count({ where: { email: emailKey, createdAt: { gte: windowStart } } }),
      this.prisma.loginAttempt.count({ where: { ipAddress: ip, createdAt: { gte: windowStart } } }),
    ]);

    return { emailAttempts, ipAttempts };
  }
}
