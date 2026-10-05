import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { R2Service } from './r2.service.js';

describe('R2Service', () => {
  let service: R2Service;

  const values: Record<string, string | undefined> = {
    R2_BUCKET_NAME: 'bucket',
    R2_ENDPOINT: 'https://account.r2.cloudflarestorage.com',
    R2_ACCESS_KEY_ID: 'key',
    R2_SECRET_ACCESS_KEY: 'secret',
    R2_REGION: 'auto',
    R2_PREFIXES: 'Movies, Series',
    PRESIGN_TTL_SECONDS: '600',
  };
  const config = {
    getOrThrow: vi.fn((key: string) => values[key]),
    get: vi.fn((key: string) => values[key]),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        R2Service,
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    service = module.get<R2Service>(R2Service);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('parsea prefijos desde la config', () => {
    expect(service.prefixes).toEqual(['Movies', 'Series']);
    expect(config.getOrThrow).toHaveBeenCalledWith('R2_BUCKET_NAME');
  });
});
