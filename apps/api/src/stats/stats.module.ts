import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { StudentsModule } from '../students/students.module';
import { StatsController } from './stats.controller';
import { StatsService } from './stats.service';

@Module({
  imports: [UsersModule, StudentsModule],
  controllers: [StatsController],
  providers: [StatsService],
})
export class StatsModule {}
