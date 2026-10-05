import { IsNotEmpty, IsString } from 'class-validator';

export class PresignDto {
  @IsString()
  @IsNotEmpty()
  r2Key: string;
}

export class SubtitleQueryDto {
  @IsString()
  @IsNotEmpty()
  subtitleKey: string;
}
