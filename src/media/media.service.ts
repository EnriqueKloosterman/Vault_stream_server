import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { R2Service } from '../infra/r2/r2.service.js';
import { LibraryService } from '../library/library.service.js';

@Injectable()
export class MediaService {
  constructor(
    private readonly libraryService: LibraryService,
    private readonly r2: R2Service,
  ) {}

  async presign(
    userId: string,
    r2Key: string,
  ): Promise<{ url: string; expiresIn: number }> {
    const owned = await this.libraryService.findOwnedKey(userId, r2Key);
    if (owned) {
      return this.r2.presignGet(r2Key);
    }
    // 404 siempre para no-propietarios: no revelar si la clave existe.
    throw new NotFoundException('Recurso no encontrado');
  }

  async subtitle(
    userId: string,
    subtitleKey: string,
  ): Promise<{ url: string; expiresIn: number }> {
    const owned = await this.libraryService.findOwnedSubtitle(
      userId,
      subtitleKey,
    );
    if (owned) {
      return this.r2.presignGet(subtitleKey);
    }
    throw new NotFoundException('Subtítulo no encontrado');
  }
}
