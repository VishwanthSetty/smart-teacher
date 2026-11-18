import { ApiProperty } from '@nestjs/swagger';
import { ResourceType } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class CreateBookmarkDto {
  @ApiProperty({ enum: ResourceType })
  @IsEnum(ResourceType)
  resourceType!: ResourceType;

  @ApiProperty()
  @IsString()
  resourceId!: string;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  collectionId?: string | null;
}
