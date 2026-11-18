import { Module } from '@nestjs/common';
import { EnrollmentLookupService } from './enrollment-lookup.service';

// A leaf module on purpose — it imports nothing (PrismaModule is global). EntitlementsModule
// depends on it without dragging in StudentsModule, whose task fan-out would close a
// Students -> Tasks -> Entitlements -> Students module cycle.
@Module({
  providers: [EnrollmentLookupService],
  exports: [EnrollmentLookupService],
})
export class EnrollmentLookupModule {}
