import { Test, TestingModule } from '@nestjs/testing';
import { R2Service } from './r2.service.js';

describe('R2Service', () => {
  let service: R2Service;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [R2Service],
    }).compile();

    service = module.get<R2Service>(R2Service);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
