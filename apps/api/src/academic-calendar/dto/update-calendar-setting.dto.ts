import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateCalendarSettingDto {
  @ApiProperty({ description: 'false opts the school out for that year: viewers see an empty calendar.' })
  @IsBoolean()
  isEnabled!: boolean;
}
