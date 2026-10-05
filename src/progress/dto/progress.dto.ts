import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsMongoId,
  IsNumber,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class ProgressQueryDto {
  @IsOptional()
  @IsIn(['movie', 'episode'])
  itemType?: 'movie' | 'episode';

  @IsOptional()
  @IsMongoId()
  refId?: string;
}

export class ProgressUpdateDto {
  @IsIn(['movie', 'episode'])
  itemType: 'movie' | 'episode';

  @IsMongoId()
  refId: string;

  @IsNumber()
  @Min(0)
  currentTimeSec: number;

  @IsNumber()
  @Min(0)
  durationSec: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  completedPct: number;

  @IsNumber()
  @Min(1)
  lastUpdated: number;
}

export class ProgressBodyDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ProgressUpdateDto)
  updates?: ProgressUpdateDto[];

  @IsOptional()
  @IsIn(['movie', 'episode'])
  itemType?: 'movie' | 'episode';

  @IsOptional()
  @IsMongoId()
  refId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  currentTimeSec?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  durationSec?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  completedPct?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  lastUpdated?: number;
}
