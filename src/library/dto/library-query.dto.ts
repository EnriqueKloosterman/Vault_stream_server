import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class LibraryQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsIn(['movie', 'series'])
  type?: 'movie' | 'series';

  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;
}

export class ScanDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  prefixes?: string[];
}
