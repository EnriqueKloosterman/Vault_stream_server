import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type Model, Types } from 'mongoose';
import type { QueryFilter } from 'mongoose';
import { ProgressBodyDto, ProgressUpdateDto } from './dto/progress.dto.js';
import { WatchProgress } from './schemas/watch-progress.schema.js';

@Injectable()
export class ProgressService {
  constructor(
    @InjectModel(WatchProgress.name)
    private readonly progressModel: Model<WatchProgress>,
  ) {}

  async list(
    userId: string,
    itemType?: 'movie' | 'episode',
    refId?: string,
  ): Promise<WatchProgress[]> {
    if (!Types.ObjectId.isValid(userId)) {
      return [];
    }
    const filter: QueryFilter<WatchProgress> = {
      userId: new Types.ObjectId(userId),
    };
    if (itemType) {
      filter.itemType = itemType;
    }
    if (refId) {
      if (!Types.ObjectId.isValid(refId)) {
        return [];
      }
      filter.refId = new Types.ObjectId(refId);
    }
    return this.progressModel
      .find(filter)
      .sort({ lastUpdated: -1 })
      .limit(500)
      .exec();
  }

  resolveUpdates(body: ProgressBodyDto): ProgressUpdateDto[] {
    const list = Array.isArray(body.updates) ? body.updates : null;
    if (list !== null) {
      if (list.length === 0) {
        throw new BadRequestException('updates no puede estar vacío');
      }
      for (const update of list) {
        this.assertCoherent(update);
      }
      return list;
    }
    const single: ProgressBodyDto = body;
    if (
      single.itemType !== undefined &&
      single.refId !== undefined &&
      single.currentTimeSec !== undefined &&
      single.durationSec !== undefined &&
      single.completedPct !== undefined &&
      single.lastUpdated !== undefined
    ) {
      const update: ProgressUpdateDto = {
        itemType: single.itemType,
        refId: single.refId,
        currentTimeSec: single.currentTimeSec,
        durationSec: single.durationSec,
        completedPct: single.completedPct,
        lastUpdated: single.lastUpdated,
      };
      this.assertCoherent(update);
      return [update];
    }
    throw new BadRequestException(
      'Cuerpo inválido: envía updates[] o un progreso completo',
    );
  }

  private assertCoherent(update: ProgressUpdateDto): void {
    if (
      update.durationSec > 0 &&
      update.currentTimeSec > update.durationSec
    ) {
      throw new BadRequestException(
        'currentTimeSec no puede superar durationSec',
      );
    }
  }

  async apply(
    userId: string,
    body: ProgressBodyDto,
  ): Promise<{ updated: number; skipped: number }> {
    const updates = this.resolveUpdates(body);
    const userIdObj = new Types.ObjectId(userId);

    // Dedup intra-batch: quedarse con el max lastUpdated por clave.
    // Los duplicados colapsados cuentan como skipped.
    const deduped = new Map<string, ProgressUpdateDto>();
    let collapsed = 0;
    for (const update of updates) {
      const key = `${update.itemType}:${update.refId}`;
      const prev = deduped.get(key);
      if (!prev) {
        deduped.set(key, update);
      } else if (update.lastUpdated > prev.lastUpdated) {
        deduped.set(key, update);
        collapsed += 1;
      } else {
        collapsed += 1;
      }
    }
    const unique = [...deduped.values()];

    const existing = await this.progressModel
      .find({
        userId: userIdObj,
        $or: unique.map((update) => ({
          itemType: update.itemType,
          refId: new Types.ObjectId(update.refId),
        })),
      })
      .exec();

    const known = new Map<string, number>();
    for (const doc of existing) {
      known.set(`${doc.itemType}:${String(doc.refId)}`, doc.lastUpdated);
    }

    // Reloj cliente con futuro lejano bloquearía LWW para siempre:
    // clampear a ahora + tolerancia.
    const now = Date.now();
    const MAX_SKEW_MS = 5 * 60 * 1000;

    let updated = 0;
    let skipped = collapsed;
    const operations = [];

    for (const update of unique) {
      const key = `${update.itemType}:${update.refId}`;
      const lastUpdated = Math.min(update.lastUpdated, now + MAX_SKEW_MS);
      const currentLastUpdated = known.get(key);
      if (currentLastUpdated !== undefined && lastUpdated <= currentLastUpdated) {
        skipped += 1;
        continue;
      }
      known.set(key, lastUpdated);
      updated += 1;
      const refIdObj = new Types.ObjectId(update.refId);
      operations.push({
        updateOne: {
          // Filtro de versión: atómico frente a escrituras concurrentes.
          // Si otro dispositivo escribió un lastUpdated mayor entremedias,
          // este update no pisa (last-write-wins real).
          filter: {
            userId: userIdObj,
            itemType: update.itemType,
            refId: refIdObj,
            $or: [
              { lastUpdated: { $lt: lastUpdated } },
              { lastUpdated: { $exists: false } },
            ],
          },
          update: {
            $set: {
              currentTimeSec: update.currentTimeSec,
              durationSec: update.durationSec,
              completedPct: update.completedPct,
              lastUpdated,
              syncedAt: new Date(),
            },
            // Necesario porque el filtro con $or no permite a Mongo
            // inferir los campos de identidad en el upsert.
            $setOnInsert: {
              userId: userIdObj,
              itemType: update.itemType,
              refId: refIdObj,
            },
          },
          upsert: true,
        },
      });
    }

    if (operations.length > 0) {
      try {
        await this.progressModel.bulkWrite(operations, { ordered: false });
      } catch (error) {
        // Condición de carrera: otro dispositivo escribió un lastUpdated
        // mayor entremedias y el upsert chocó con el índice único.
        // Esos casos son "skipped", no errores.
        const writeErrors: Array<{ code?: unknown }> =
          typeof error === 'object' && error !== null && 'writeErrors' in error
            ? ((error as { writeErrors?: unknown }).writeErrors as Array<{
                code?: unknown;
              }>) ?? []
            : [];
        const dupes = writeErrors.filter(
          (e) => e?.code === 11000 || e?.code === 11001,
        ).length;
        const others = writeErrors.length - dupes;
        if (writeErrors.length === 0 || others > 0) {
          throw error;
        }
        updated -= dupes;
        skipped += dupes;
      }
    }

    return { updated, skipped };
  }
}
