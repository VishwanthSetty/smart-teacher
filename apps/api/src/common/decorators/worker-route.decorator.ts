import { SetMetadata } from '@nestjs/common';

export const IS_WORKER_ROUTE_KEY = 'isWorkerRoute';

// "Authenticated as the transcode worker, not as a user." A third authorization category
// alongside @Public and @Roles: JwtAuthGuard and RolesGuard both stand down for it, and
// the global WorkerAuthGuard enforces an HMAC signature in their place. A route carrying
// this and nothing else is still guarded — that is exactly why it is not @Public().
//
// The same key both stands RolesGuard down and turns WorkerAuthGuard on, so the guarded
// invariant is structural: there is no way to mark a route as worker-authenticated and
// forget to enforce it.
//
// Method-level only, for the same reason as @Public: on a controller class it would make
// every future method on it worker-authenticated by omission.
//
// This file deliberately imports nothing but SetMetadata — the guard imports the key, and
// anything heavier here would put a cycle in its way.
export const WorkerRoute = () => SetMetadata(IS_WORKER_ROUTE_KEY, true);
