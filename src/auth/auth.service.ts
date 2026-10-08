import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
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
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return false;
  }
  const code = (error as { code?: unknown }).code;
  if (code === 11000 || code === 11001 || code === 'DuplicateKey') {
    return true;
  }
  const cause = (error as { cause?: unknown }).cause;
  return (
    typeof cause === 'object' &&
    cause !== null &&
    'code' in cause &&
    ((cause as { code?: unknown }).code === 11000 ||
      (cause as { code?: unknown }).code === 11001)
  );
}

// Hash dummy para igualar tiempos y evitar enumeración por timing.
const DUMMY_HASH = '$2b$10$C6UzMDM.H6dfI/f/IKcEe.u7wRybpODfHhJxKzN8YxQ1Q1Q1Q1Q1u';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly scannerService: ScannerService,
  ) {}

  async register(dto: RegisterDto): Promise<{ access_token: string }> {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.usersService.findByEmail(email);
    if (existing) {
      throw new ConflictException('El email ya está registrado');
    }

    const passwordHash = await hash(dto.password, 10);
    try {
      const user = await this.usersService.create(email, passwordHash);
      void this.scannerService.scanAuto(String(user._id)).catch((e: unknown) => {
        this.logger.warn(`scanAuto falló tras register: ${String(e)}`);
      });
      return this.sign(String(user._id), user.email);
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new ConflictException('El email ya está registrado');
      }
      this.logger.error('register falló', error as Error);
      throw new InternalServerErrorException('No se pudo completar el registro');
    }
  }

  async login(dto: LoginDto): Promise<{ access_token: string }> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.usersService.findByEmail(email);
    const hashToCompare = user ? user.passwordHash : DUMMY_HASH;
    const valid = await compare(dto.password, hashToCompare);
    if (!user || !valid) {
      throw new UnauthorizedException('Credenciales inválidas');
    }
    void this.scannerService.scanAuto(String(user._id)).catch((e: unknown) => {
      this.logger.warn(`scanAuto falló tras login: ${String(e)}`);
    });
    return this.sign(String(user._id), user.email);
  }

  private sign(userId: string, email: string): { access_token: string } {
    const payload: JwtPayload = { sub: userId, email };
    return { access_token: this.jwtService.sign(payload) };
  }
}
