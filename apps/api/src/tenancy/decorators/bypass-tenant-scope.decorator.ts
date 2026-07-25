import { SetMetadata } from '@nestjs/common';

export const BYPASS_TENANT_SCOPE_KEY = 'bypassTenantScope';

// Opt-in only: the interceptor still requires the caller to be SUPER_ADMIN before
// honouring this. Marking a route bypassable does not by itself grant cross-tenant access.
export const BypassTenantScope = () => SetMetadata(BYPASS_TENANT_SCOPE_KEY, true);
