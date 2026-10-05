import {
  IsIn,
  IsMongoId,
  IsNumber,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

export class StartDownloadDto {
  @IsIn(['movie', 'episode'])
  itemType: 'movie' | 'episode';

  @IsMongoId()
  refId: string;
}

export class DownloadProgressDto {
  @IsNumber()
  @Min(0)
  @Max(100)
  progressPct: number;
}

export class DownloadCompleteDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  fileSize?: number;
}
