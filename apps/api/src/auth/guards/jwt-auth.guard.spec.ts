import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { Public } from '../../common/decorators/public.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';

class Fixture {
  @Public()
  open(): void {}

  protected(): void {}
}

function contextFor(method: string) {
  return {
    getHandler: () => (Fixture.prototype as unknown as Record<string, () => void>)[method],
    getClass: () => Fixture,
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  it('short-circuits on @Public without invoking the passport guard', () => {
    const superSpy = jest.spyOn(AuthGuard('jwt').prototype, 'canActivate');
    const guard = new JwtAuthGuard(new Reflector());

    expect(guard.canActivate(contextFor('open'))).toBe(true);
    expect(superSpy).not.toHaveBeenCalled();

    superSpy.mockRestore();
  });

  it('delegates to the passport guard when the route is not public', () => {
    const superSpy = jest.spyOn(AuthGuard('jwt').prototype, 'canActivate').mockReturnValue(true);
    const guard = new JwtAuthGuard(new Reflector());

    guard.canActivate(contextFor('protected'));

    expect(superSpy).toHaveBeenCalled();
    superSpy.mockRestore();
  });
});
