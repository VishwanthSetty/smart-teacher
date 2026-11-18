import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsIn, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListNotificationsQueryDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => value === true || value === 'true')
  @IsBoolean()
  unread?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  cursor?: string;
}

export class UpdateNotificationPreferenceDto {
  @ApiProperty({ required: false }) @IsOptional() @IsBoolean() inAppEnabled?: boolean;
  @ApiProperty({ required: false }) @IsOptional() @IsBoolean() pushEnabled?: boolean;
  @ApiProperty({ required: false }) @IsOptional() @IsBoolean() taskRemindersEnabled?: boolean;
  @ApiProperty({ required: false, nullable: true })
  @IsOptional() @IsInt() @Min(0) @Max(10080) dueSoonLeadMins?: number | null;
  @ApiProperty({ required: false, nullable: true })
  @IsOptional() @IsInt() @Min(0) @Max(1439) quietFromMins?: number | null;
  @ApiProperty({ required: false, nullable: true })
  @IsOptional() @IsInt() @Min(0) @Max(1439) quietToMins?: number | null;
}

export class RegisterDeviceDto {
  @ApiProperty({ enum: ['ios', 'android'] })
  @IsIn(['ios', 'android'])
  platform!: 'ios' | 'android';

  @ApiProperty()
  @IsString()
  token!: string;
}
