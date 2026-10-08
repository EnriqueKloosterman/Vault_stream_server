import {
  Injectable,
  NotFoundException,
  type OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type Model, Types } from 'mongoose';
import { R2Service } from '../infra/r2/r2.service.js';
import { LibraryService } from '../library/library.service.js';
import type { StartDownloadDto } from './dto/downloads.dto.js';
import { Download, type DownloadDocument } from './schemas/download.schema.js';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class DownloadsService implements OnModuleInit {
  constructor(
    @InjectModel(Download.name)
    private readonly downloadsModel: Model<Download>,
    private readonly libraryService: LibraryService,
    private readonly r2: R2Service,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.purgeExpired();
    // Sin cron externo los expirados se acumularían hasta el reinicio:
    // purga periódica cada hora.
    const timer = setInterval(() => {
      void this.purgeExpired().catch(() => undefined);
    }, 60 * 60 * 1000);
    timer.unref?.();
  }

  async list(userId: string): Promise<Download[]> {
    return this.downloadsModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ updatedAt: -1 })
      .limit(500)
      .exec();
  }

  async start(
    userId: string,
    dto: StartDownloadDto,
  ): Promise<{
    downloadId: string;
    url: string;
    expiresIn: number;
    fileName: string;
    fileSize?: number;
  }> {
    const video = await this.libraryService.findVideoForDownload(
      userId,
      dto.itemType,
      dto.refId,
    );
    const userIdObj = new Types.ObjectId(userId);
    const refIdObj = new Types.ObjectId(dto.refId);
    const expiresAt = new Date(Date.now() + SEVEN_DAYS_MS);

    const resetExisting = async (): Promise<DownloadDocument | null> => {
      const found = await this.downloadsModel
        .findOne({ userId: userIdObj, itemType: dto.itemType, refId: refIdObj })
        .exec();
      if (!found) {
        return null;
      }
      found.set({
        localPath: `downloads/${String(found._id)}.mp4`,
        r2Key: video.r2Key,
        fileSize: video.fileSize,
        status: 'pending',
        progressPct: 0,
        expiresAt,
      });
      await found.updateOne({ $unset: { error: 1 } }).exec();
      found.error = undefined;
      return found.save();
    };

    const existing = await this.downloadsModel
      .findOne({ userId: userIdObj, itemType: dto.itemType, refId: refIdObj })
      .exec();

    let doc: DownloadDocument;
    if (existing) {
      existing.set({
        localPath: `downloads/${String(existing._id)}.mp4`,
        r2Key: video.r2Key,
        fileSize: video.fileSize,
        status: 'pending',
        progressPct: 0,
        expiresAt,
      });
      await existing.updateOne({ $unset: { error: 1 } }).exec();
      existing.error = undefined;
      doc = await existing.save();
    } else {
      const downloadId = new Types.ObjectId();
      try {
        doc = await this.downloadsModel.create({
          _id: downloadId,
          userId: userIdObj,
          itemType: dto.itemType,
          refId: refIdObj,
          localPath: `downloads/${String(downloadId)}.mp4`,
          r2Key: video.r2Key,
          fileSize: video.fileSize,
          status: 'pending',
          progressPct: 0,
          expiresAt,
        });
      } catch (error) {
        if (
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          ((error as { code?: unknown }).code === 11000 ||
            (error as { code?: unknown }).code === 11001)
        ) {
          // Carrera: otro request creó el registro primero -> reutilizarlo.
          const winner = await resetExisting();
          if (!winner) {
            throw error;
          }
          doc = winner;
        } else {
          throw error;
        }
      }
    }

    // Nota: `url` es un presigned GET con TTL corto (PRESIGN_TTL_SECONDS,
    // por defecto 10 min) mientras `expiresAt` marca la vigencia del
    // registro (7 días). Si la URL caduca, el cliente debe llamar de nuevo
    // a `start` para obtener una URL fresca.
    const { url, expiresIn } = await this.r2.presignGet(video.r2Key);
    return {
      downloadId: String(doc._id),
      url,
      expiresIn,
      fileName: video.fileName,
      fileSize: video.fileSize ?? doc.fileSize,
    };
  }

  async updateProgress(
    userId: string,
    downloadId: string,
    progressPct: number,
  ): Promise<Download> {
    const doc = await this.owned(userId, downloadId);
    if (doc.status === 'completed') {
      return doc;
    }
    // Monotónico: no retroceder el progreso.
    if (progressPct > doc.progressPct) {
      doc.progressPct = progressPct;
    }
    doc.status = 'downloading';
    return doc.save();
  }

  async complete(
    userId: string,
    downloadId: string,
    fileSize?: number,
  ): Promise<Download> {
    const doc = await this.owned(userId, downloadId);
    doc.status = 'completed';
    doc.progressPct = 100;
    if (fileSize !== undefined) {
      doc.fileSize = fileSize;
    }
    return doc.save();
  }

  async remove(userId: string, downloadId: string): Promise<{ deleted: boolean }> {
    if (!Types.ObjectId.isValid(downloadId)) {
      return { deleted: false };
    }
    const result = await this.downloadsModel.deleteOne({
      _id: new Types.ObjectId(downloadId),
      userId: new Types.ObjectId(userId),
    });
    return { deleted: result.deletedCount === 1 };
  }

  async purgeExpired(): Promise<number> {
    const result = await this.downloadsModel.deleteMany({
      expiresAt: { $lt: new Date() },
    });
    return result.deletedCount ?? 0;
  }

  private async owned(userId: string, downloadId: string): Promise<DownloadDocument> {
    if (!Types.ObjectId.isValid(downloadId)) {
      throw new NotFoundException('Descarga no encontrada');
    }
    const doc = await this.downloadsModel
      .findOne({
        _id: new Types.ObjectId(downloadId),
        userId: new Types.ObjectId(userId),
      })
      .exec();
    if (!doc) {
      throw new NotFoundException('Descarga no encontrada');
    }
    return doc;
  }
}
