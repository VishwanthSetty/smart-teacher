import { HttpException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { LoginThrottleService } from './login-throttle.service';

describe('LoginThrottleService', () => {
  let service: LoginThrottleService;
  let prisma: {
    loginAttempt: { deleteMany: jest.Mock; count: jest.Mock; create: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      loginAttempt: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue(undefined),
      },
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [LoginThrottleService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(LoginThrottleService);
  });

  it('allows the attempt when under the threshold', async () => {
    prisma.loginAttempt.count.mockResolvedValue(19);
    await expect(service.assertNotLockedOut('demo-school:a@b.com', '127.0.0.1')).resolves.toBeUndefined();
  });

  it('locks out once the per-email count reaches the threshold', async () => {
    prisma.loginAttempt.count.mockImplementation(({ where }: { where: { email?: string } }) =>
      Promise.resolve(where.email ? 20 : 0),
    );
    await expect(service.assertNotLockedOut('demo-school:a@b.com', '127.0.0.1')).rejects.toBeInstanceOf(
      HttpException,
    );
  });

  it('locks out once the per-IP count reaches the threshold, independent of the email key', async () => {
    prisma.loginAttempt.count.mockImplementation(({ where }: { where: { ipAddress?: string } }) =>
      Promise.resolve(where.ipAddress ? 20 : 0),
    );
    await expect(service.assertNotLockedOut('demo-school:a@b.com', '127.0.0.1')).rejects.toBeInstanceOf(
      HttpException,
    );
  });

  it('prunes attempts older than the window on every check', async () => {
    await service.assertNotLockedOut('demo-school:a@b.com', '127.0.0.1');
    expect(prisma.loginAttempt.deleteMany).toHaveBeenCalledWith({
      where: { createdAt: { lt: expect.any(Date) } },
    });
  });

  it('records a failure keyed by both email and ip', async () => {
    await service.recordFailure('demo-school:a@b.com', '127.0.0.1');
    expect(prisma.loginAttempt.create).toHaveBeenCalledWith({
      data: { email: 'demo-school:a@b.com', ipAddress: '127.0.0.1' },
    });
  });

  it('clears failures for the given email key on success', async () => {
    await service.clearFailures('demo-school:a@b.com');
    expect(prisma.loginAttempt.deleteMany).toHaveBeenCalledWith({ where: { email: 'demo-school:a@b.com' } });
  });

  it('allows a reset request when under the reset threshold', async () => {
    prisma.loginAttempt.count.mockResolvedValue(4);
    await expect(
      service.assertResetNotThrottled('reset:demo-school:a@b.com', 'reset:127.0.0.1'),
    ).resolves.toBeUndefined();
  });

  it('throttles reset requests once the per-email reset count reaches the threshold', async () => {
    prisma.loginAttempt.count.mockImplementation(({ where }: { where: { email?: string } }) =>
      Promise.resolve(where.email ? 5 : 0),
    );
    await expect(
      service.assertResetNotThrottled('reset:demo-school:a@b.com', 'reset:127.0.0.1'),
    ).rejects.toBeInstanceOf(HttpException);
  });

  it('does not let 20 login failures block a reset request (separate key namespace)', async () => {
    // The reset check only ever counts rows under the "reset:" keys it queries by,
    // so login-lockout volume on the plain keys is invisible to it.
    prisma.loginAttempt.count.mockResolvedValue(0);
    await expect(
      service.assertResetNotThrottled('reset:demo-school:a@b.com', 'reset:127.0.0.1'),
    ).resolves.toBeUndefined();
  });

  it('records a reset attempt keyed by both the namespaced email and ip', async () => {
    await service.recordAttempt('reset:demo-school:a@b.com', 'reset:127.0.0.1');
    expect(prisma.loginAttempt.create).toHaveBeenCalledWith({
      data: { email: 'reset:demo-school:a@b.com', ipAddress: 'reset:127.0.0.1' },
    });
  });
});
