import { Module } from '@nestjs/common';

import { HealthController } from './health.controller';

/**
 * Liveness/readiness. No FRD feature; infrastructure concern only.
 */
@Module({
  controllers: [HealthController],
})
export class HealthModule {}
