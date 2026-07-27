import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

// Opt out of authentication entirely. Method-level only by convention: on a controller
// class it would silently make every future method on it public by omission, and the
// override semantics in RolesGuard/JwtAuthGuard mean a method could not claw it back.
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
