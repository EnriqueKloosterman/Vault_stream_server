import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { compare, hash } from 'bcryptjs';
import { UsersService } from '../users/users.service.js';
import { AuthService } from './auth.service.js';

vi.mock('bcryptjs', () => ({
  hash: vi.fn(),
  compare: vi.fn(),
}));

describe('AuthService', () => {
  let service: AuthService;

  const usersService = {
    findByEmail: vi.fn(),
    create: vi.fn(),
  };
  const jwtService = {
    sign: vi.fn(),
  };

  const userDoc = {
    _id: 'u1',
    email: 'test@example.com',
    passwordHash: 'hashed-password',
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    jwtService.sign.mockReturnValue('signed-token');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: JwtService, useValue: jwtService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('register', () => {
    it('crea el usuario y devuelve access_token', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      vi.mocked(hash).mockResolvedValue('hashed-password' as never);
      usersService.create.mockResolvedValue(userDoc);

      const result = await service.register({
        email: 'test@example.com',
        password: 'secret123',
      });

      expect(result).toEqual({ access_token: 'signed-token' });
      expect(hash).toHaveBeenCalledWith('secret123', 10);
      expect(usersService.create).toHaveBeenCalledWith(
        'test@example.com',
        'hashed-password',
      );
      expect(jwtService.sign).toHaveBeenCalledWith({
        sub: 'u1',
        email: 'test@example.com',
      });
    });

    it('rechaza email ya registrado con 409', async () => {
      usersService.findByEmail.mockResolvedValue(userDoc);

      await expect(
        service.register({ email: 'test@example.com', password: 'secret123' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(usersService.create).not.toHaveBeenCalled();
    });

    it('rechaza duplicado detectado en índice único (11000)', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      vi.mocked(hash).mockResolvedValue('hashed-password' as never);
      usersService.create.mockRejectedValue({ code: 11000 });

      await expect(
        service.register({ email: 'test@example.com', password: 'secret123' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('login', () => {
    it('devuelve access_token con credenciales válidas', async () => {
      usersService.findByEmail.mockResolvedValue(userDoc);
      vi.mocked(compare).mockResolvedValue(true as never);

      const result = await service.login({
        email: 'test@example.com',
        password: 'secret123',
      });

      expect(result).toEqual({ access_token: 'signed-token' });
      expect(compare).toHaveBeenCalledWith('secret123', 'hashed-password');
      expect(jwtService.sign).toHaveBeenCalledWith({
        sub: 'u1',
        email: 'test@example.com',
      });
    });

    it('rechaza si el usuario no existe', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      await expect(
        service.login({ email: 'none@example.com', password: 'secret123' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rechaza si la contraseña es incorrecta', async () => {
      usersService.findByEmail.mockResolvedValue(userDoc);
      vi.mocked(compare).mockResolvedValue(false as never);

      await expect(
        service.login({ email: 'test@example.com', password: 'wrong-pass' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(jwtService.sign).not.toHaveBeenCalled();
    });
  });
});
