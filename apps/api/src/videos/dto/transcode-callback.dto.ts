import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export enum TranscodeResult {
  // Sent when a worker leases the job, before it downloads anything. This is what moves a
  // video QUEUED -> PROCESSING, and it doubles as the worker's "is this job still wanted?"
  // check — a 409 here tells it to abort before burning any CPU.
  STARTED = 'started',
  SUCCEEDED = 'succeeded',
  FAILED = 'failed',
}

export class TranscodeRenditionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(16)
  name!: string;

  @IsInt()
  @Min(16)
  @Max(7680)
  width!: number;

  @IsInt()
  @Min(16)
  @Max(4320)
  height!: number;

  @IsInt()
  @Min(1)
  @Max(100_000)
  bitrateKbps!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  playlistKey!: string;
}

export class TranscodeCallbackDto {
  @IsString()
  @IsNotEmpty()
  videoId!: string;

  @IsEnum(TranscodeResult)
  result!: TranscodeResult;

  // The fencing token from the job payload. Refused unless it matches the row's current
  // transcodeAttempts — see TranscodeCallbackService.
  @IsInt()
  @Min(1)
  attempt!: number;

  // The success fields. `forbidNonWhitelisted` only rejects *undeclared* properties, so a
  // failureReason sent alongside result: 'succeeded' still passes the pipe; the service
  // ignores it rather than the validator stripping it.
  @ValidateIf((dto: TranscodeCallbackDto) => dto.result === TranscodeResult.SUCCEEDED)
  @IsInt()
  @Min(1)
  @Max(86_400)
  durationSecs?: number;

  @ValidateIf((dto: TranscodeCallbackDto) => dto.result === TranscodeResult.SUCCEEDED)
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  playlistKey?: string;

  @ValidateIf((dto: TranscodeCallbackDto) => dto.result === TranscodeResult.SUCCEEDED)
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  posterKey?: string;

  @ValidateIf((dto: TranscodeCallbackDto) => dto.result === TranscodeResult.SUCCEEDED)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => TranscodeRenditionDto)
  renditions?: TranscodeRenditionDto[];

  @ValidateIf((dto: TranscodeCallbackDto) => dto.result === TranscodeResult.FAILED)
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  failureReason?: string;
}
