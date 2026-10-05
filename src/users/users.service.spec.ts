import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { User } from './schemas/user.schema.js';
import { UsersService } from './users.service.js';

describe('UsersService', () => {
  let service: UsersService;

  const userModel = {
    create: vi.fn(),
    findOne: vi.fn(),
    findById: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getModelToken(User.name), useValue: userModel },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('create delega en el modelo', async () => {
    const doc = { _id: 'u1', email: 'a@b.c' };
    userModel.create.mockResolvedValue(doc);

    const result = await service.create('a@b.c', 'hash');

    expect(result).toBe(doc);
    expect(userModel.create).toHaveBeenCalledWith({
      email: 'a@b.c',
      passwordHash: 'hash',
    });
  });

  it('findByEmail normaliza el email y selecciona passwordHash', async () => {
    const exec = vi.fn().mockResolvedValue(null);
    const select = vi.fn().mockReturnValue({ exec });
    userModel.findOne.mockReturnValue({ select });

    const result = await service.findByEmail('Mixed@Example.COM');

    expect(result).toBeNull();
    expect(userModel.findOne).toHaveBeenCalledWith({
      email: 'mixed@example.com',
    });
    expect(select).toHaveBeenCalledWith('+passwordHash');
    expect(exec).toHaveBeenCalled();
  });

  it('findById delega en el modelo', async () => {
    const exec = vi.fn().mockResolvedValue({ _id: 'u1' });
    userModel.findById.mockReturnValue({ exec });

    const result = await service.findById('u1');

    expect(result).toEqual({ _id: 'u1' });
    expect(userModel.findById).toHaveBeenCalledWith('u1');
  });
});
