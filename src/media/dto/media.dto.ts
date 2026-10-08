import { IsNotEmpty, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const R2_KEY_RE = /^(?!.*\.\.)[^\\\n\r]+$/;

export class PresignDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(1024)
  @Matches(R2_KEY_RE, { message: 'r2Key inválido' })
  r2Key: string;
}

export class SubtitleQueryDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(1024)
  @Matches(R2_KEY_RE, { message: 'subtitleKey inválido' })
  subtitleKey: string;
}
