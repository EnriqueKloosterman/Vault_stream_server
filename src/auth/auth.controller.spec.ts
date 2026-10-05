import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service.js';
import { AuthController } from './auth.controller.js';

describe('AuthController', () => {
  let controller: AuthController;

  const authService = {
    register: vi.fn(),
    login: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('register delega en AuthService', async () => {
    authService.register.mockResolvedValue({ access_token: 'token' });

    const result = await controller.register({
      email: 'test@example.com',
      password: 'secret123',
    });

    expect(result).toEqual({ access_token: 'token' });
    expect(authService.register).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'secret123',
    });
  });

  it('login delega en AuthService', async () => {
    authService.login.mockResolvedValue({ access_token: 'token' });

    const result = await controller.login({
      email: 'test@example.com',
      password: 'secret123',
    });

    expect(result).toEqual({ access_token: 'token' });
    expect(authService.login).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'secret123',
    });
  });
});
