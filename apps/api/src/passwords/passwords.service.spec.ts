import { BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PasswordsService } from './passwords.service';

describe('PasswordsService', () => {
  const service = new PasswordsService();

  it('uses and hashes an acceptable supplied password', async () => {
    const material = await service.resolve('Teal-Fox-7412', 'teacher@example.com');
    expect(material.password).toBe('Teal-Fox-7412');
    await expect(bcrypt.compare(material.password, material.passwordHash)).resolves.toBe(true);
  });

  it('generates a readable password when blank', async () => {
    const material = await service.resolve('', 'teacher@example.com');
    expect(material.password).toMatch(/^[A-Za-z]+-[A-Za-z]+-\d{4}$/);
    expect(material.password.length).toBeGreaterThanOrEqual(12);
  });

  it('rejects a password matching the email case-insensitively', async () => {
    await expect(service.resolve('TEACHER@EXAMPLE.COM', 'teacher@example.com')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
