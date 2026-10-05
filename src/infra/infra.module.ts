import { Module } from '@nestjs/common';
import { R2Service } from './r2/r2.service.js';

@Module({
  providers: [R2Service]
})
export class InfraModule {}
