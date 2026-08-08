import { BadRequestException, Injectable } from '@nestjs/common';
import { randomInt } from 'crypto';
import * as bcrypt from 'bcrypt';

const BCRYPT_ROUNDS = 10;
const ADJECTIVES = ['Amber', 'Brisk', 'Calm', 'Coral', 'Green', 'Merry', 'Silver', 'Teal'];
const ANIMALS = ['Bear', 'Deer', 'Dove', 'Fox', 'Lynx', 'Otter', 'Panda', 'Robin'];

export interface PasswordMaterial {
  password: string;
  passwordHash: string;
}

@Injectable()
export class PasswordsService {
  async resolve(password: string | undefined, email: string): Promise<PasswordMaterial> {
    const resolved = password && password.trim() !== '' ? password : this.generate();
    this.assertAcceptable(resolved, email);
    return { password: resolved, passwordHash: await bcrypt.hash(resolved, BCRYPT_ROUNDS) };
  }

  generate(): string {
    const adjective = ADJECTIVES[randomInt(ADJECTIVES.length)];
    const animal = ANIMALS[randomInt(ANIMALS.length)];
    return `${adjective}-${animal}-${randomInt(1000, 10000)}`;
  }

  assertAcceptable(password: string, email: string): void {
    if (password.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters.');
    }
    if (password.length > 72) {
      throw new BadRequestException('Password must be at most 72 characters.');
    }
    if (password.toLowerCase() === email.toLowerCase()) {
      throw new BadRequestException('Password must be different from the email address.');
    }
  }
}
