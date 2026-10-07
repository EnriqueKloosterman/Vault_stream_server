import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { Download } from '../downloads/schemas/download.schema.js';
import { Episode } from '../library/schemas/episode.schema.js';
import { LibraryItem } from '../library/schemas/library-item.schema.js';
import { Season } from '../library/schemas/season.schema.js';
import { Series } from '../library/schemas/series.schema.js';
import { WatchProgress } from '../progress/schemas/watch-progress.schema.js';
import { User } from '../users/schemas/user.schema.js';
import { MaintenanceService } from './maintenance.service.js';

function modelMocks() {
  return {
    [getModelToken(User.name)]: { distinct: vi.fn(), findByIdAndDelete: vi.fn() },
    [getModelToken(LibraryItem.name)]: { deleteMany: vi.fn() },
    [getModelToken(Series.name)]: { deleteMany: vi.fn() },
    [getModelToken(Season.name)]: { deleteMany: vi.fn() },
    [getModelToken(Episode.name)]: { deleteMany: vi.fn() },
    [getModelToken(Download.name)]: { deleteMany: vi.fn() },
    [getModelToken(WatchProgress.name)]: { deleteMany: vi.fn() },
  };
}

function deleteManyResult(deletedCount: number) {
  return { exec: vi.fn().mockResolvedValue({ deletedCount }) };
}

describe('MaintenanceService', () => {
  let service: MaintenanceService;
  const mocks = modelMocks();

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MaintenanceService,
        { provide: getModelToken(User.name), useValue: mocks[getModelToken(User.name)] },
        {
          provide: getModelToken(LibraryItem.name),
          useValue: mocks[getModelToken(LibraryItem.name)],
        },
        { provide: getModelToken(Series.name), useValue: mocks[getModelToken(Series.name)] },
        { provide: getModelToken(Season.name), useValue: mocks[getModelToken(Season.name)] },
        { provide: getModelToken(Episode.name), useValue: mocks[getModelToken(Episode.name)] },
        { provide: getModelToken(Download.name), useValue: mocks[getModelToken(Download.name)] },
        {
          provide: getModelToken(WatchProgress.name),
          useValue: mocks[getModelToken(WatchProgress.name)],
        },
      ],
    }).compile();

    service = module.get<MaintenanceService>(MaintenanceService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('cascadeDeleteUser', () => {
    const userId = '6ac44bab96c7b3bf0a1cb00c';
    const deleteMocks = [
      mocks[getModelToken(Episode.name)],
      mocks[getModelToken(Season.name)],
      mocks[getModelToken(Series.name)],
      mocks[getModelToken(LibraryItem.name)],
      mocks[getModelToken(Download.name)],
      mocks[getModelToken(WatchProgress.name)],
    ];

    beforeEach(() => {
      for (const mock of deleteMocks) {
        mock.deleteMany.mockReturnValue(deleteManyResult(7));
      }
    });

    it('borra todos los datos del usuario y luego la cuenta', async () => {
      mocks[getModelToken(User.name)].findByIdAndDelete.mockReturnValue({
        exec: vi.fn().mockResolvedValue({ _id: userId, email: 'a@b.c' }),
      });

      const result = await service.cascadeDeleteUser(userId);

      expect(result).toEqual({ deleted: true });
      for (const mock of deleteMocks) {
        expect(mock.deleteMany).toHaveBeenCalledWith({
          userId: new Types.ObjectId(userId),
        });
      }
      expect(
        mocks[getModelToken(User.name)].findByIdAndDelete,
      ).toHaveBeenCalledWith(userId);
    });

    it('devuelve deleted false si la cuenta no existe', async () => {
      mocks[getModelToken(User.name)].findByIdAndDelete.mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
      });

      const result = await service.cascadeDeleteUser(userId);

      expect(result).toEqual({ deleted: false });
    });
  });

  describe('removeOrphans', () => {
    it('borra filas de userIds que ya no tienen usuario', async () => {
      const validIds = ['6ac44bab96c7b3bf0a1cb00c'];
      mocks[getModelToken(User.name)].distinct.mockReturnValue({
        exec: vi.fn().mockResolvedValue([new Types.ObjectId(validIds[0])]),
      });
      const collections = [
        mocks[getModelToken(LibraryItem.name)],
        mocks[getModelToken(Series.name)],
        mocks[getModelToken(Season.name)],
        mocks[getModelToken(Episode.name)],
        mocks[getModelToken(Download.name)],
        mocks[getModelToken(WatchProgress.name)],
      ];
      collections.forEach((mock, index) =>
        mock.deleteMany.mockReturnValue(deleteManyResult(index)),
      );

      const total = await service.removeOrphans();

      expect(total).toBe(15);
      const expectedFilter = {
        userId: { $nin: [new Types.ObjectId(validIds[0])] },
      };
      for (const mock of collections) {
        expect(mock.deleteMany).toHaveBeenCalledWith(expectedFilter);
      }
    });
  });
});