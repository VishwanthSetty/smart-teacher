import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, Min, MinLength, ValidateIf } from 'class-validator';

/**
 * Reparent and reorder in one call. They are the same operation from the client's point
 * of view — a drag lands a node somewhere among some parent's children — and splitting
 * them would let a UI leave the tree half-moved between two requests.
 */
export class MoveContentNodeDto {
  // null moves the node to the top level.
  @ApiProperty({ nullable: true, type: String })
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  @MinLength(1)
  parentId!: string | null;

  // Zero-based index among the destination's children, counted after the node is removed
  // from wherever it was. Clamped server-side, so an out-of-range value appends.
  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  position!: number;
}
