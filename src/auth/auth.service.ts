import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcryptjs';
import { ScannerService } from '../library/scanner.service.js';
import { UsersService } from '../users/users.service.js';
import type { LoginDto } from './dto/login.dto.js';
import type { RegisterDto } from './dto/register.dto.js';
import type { JwtPayload } from './jwt.strategy.js';

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: number }).code === 11000
  );
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly scannerService: ScannerService,
  ) {}

  async register(dto: RegisterDto): Promise<{ access_token: string }> {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('El email ya está registrado');
    }

    const passwordHash = await hash(dto.password, 10);
    try {
      const user = await this.usersService.create(dto.email, passwordHash);
      void this.scannerService.scanAuto(String(user._id)).catch(() => undefined);
      return this.sign(String(user._id), user.email);
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new ConflictException('El email ya está registrado');
      }
      throw error;
    }
  }

  async login(dto: LoginDto): Promise<{ access_token: string }> {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user || !(await compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Credenciales inválidas');
    }
    void this.scannerService.scanAuto(String(user._id)).catch(() => undefined);
    return this.sign(String(user._id), user.email);
  }

  private sign(userId: string, email: string): { access_token: string } {
    const payload: JwtPayload = { sub: userId, email };
    return { access_token: this.jwtService.sign(payload) };
  }
}
