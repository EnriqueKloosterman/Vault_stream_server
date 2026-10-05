import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface R2Object {
  key: string;
  size: number;
}

@Injectable()
export class R2Service {
  private readonly client: S3Client;
  private readonly bucket: string;
  readonly prefixes: string[];
  private readonly presignTtl: number;

  constructor(config: ConfigService) {
    this.bucket = config.getOrThrow<string>('R2_BUCKET_NAME');
    this.prefixes = (config.get<string>('R2_PREFIXES') ?? '')
      .split(',')
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    this.presignTtl =
      Number(config.get<string>('PRESIGN_TTL_SECONDS') ?? '600') || 600;
    this.client = new S3Client({
      region: config.get<string>('R2_REGION') ?? 'auto',
      endpoint: config.getOrThrow<string>('R2_ENDPOINT'),
      credentials: {
        accessKeyId: config.getOrThrow<string>('R2_ACCESS_KEY_ID'),
        secretAccessKey: config.getOrThrow<string>('R2_SECRET_ACCESS_KEY'),
      },
    });
  }

  async listAll(prefix: string): Promise<R2Object[]> {
    const normalized = prefix.endsWith('/') ? prefix : `${prefix}/`;
    const objects: R2Object[] = [];
    let continuationToken: string | undefined;

    do {
      const response = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: normalized,
          ContinuationToken: continuationToken,
        }),
      );
      for (const object of response.Contents ?? []) {
        if (object.Key) {
          objects.push({ key: object.Key, size: object.Size ?? 0 });
        }
      }
      continuationToken = response.IsTruncated
        ? response.NextContinuationToken
        : undefined;
    } while (continuationToken);

    return objects;
  }

  async presignGet(key: string): Promise<{ url: string; expiresIn: number }> {
    const url = await getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: this.presignTtl },
    );
    return { url, expiresIn: this.presignTtl };
  }
}
