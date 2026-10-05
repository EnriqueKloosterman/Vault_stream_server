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
    const filter: QueryFilter<WatchProgress> = {
      userId: new Types.ObjectId(userId),
    };
    if (itemType) {
      filter.itemType = itemType;
    }
    if (refId) {
      filter.refId = new Types.ObjectId(refId);
    }
    return this.progressModel.find(filter).sort({ lastUpdated: -1 }).exec();
  }

  resolveUpdates(body: ProgressBodyDto): ProgressUpdateDto[] {
    if (Array.isArray(body.updates)) {
      if (body.updates.length === 0) {
        throw new BadRequestException('updates no puede estar vacío');
      }
      return body.updates;
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
      return [
        {
          itemType: single.itemType,
          refId: single.refId,
          currentTimeSec: single.currentTimeSec,
          durationSec: single.durationSec,
          completedPct: single.completedPct,
          lastUpdated: single.lastUpdated,
        },
      ];
    }
    throw new BadRequestException(
      'Cuerpo inválido: envía updates[] o un progreso completo',
    );
  }

  async apply(
    userId: string,
    body: ProgressBodyDto,
  ): Promise<{ updated: number; skipped: number }> {
    const updates = this.resolveUpdates(body);
    const userIdObj = new Types.ObjectId(userId);

    const existing = await this.progressModel
      .find({
        userId: userIdObj,
        $or: updates.map((update) => ({
          itemType: update.itemType,
          refId: new Types.ObjectId(update.refId),
        })),
      })
      .exec();

    const known = new Map<string, number>();
    for (const doc of existing) {
      known.set(`${doc.itemType}:${String(doc.refId)}`, doc.lastUpdated);
    }

    let updated = 0;
    let skipped = 0;
    const operations = [];

    for (const update of updates) {
      const key = `${update.itemType}:${update.refId}`;
      const currentLastUpdated = known.get(key);
      if (currentLastUpdated !== undefined && update.lastUpdated <= currentLastUpdated) {
        skipped += 1;
        continue;
      }
      known.set(key, update.lastUpdated);
      updated += 1;
      operations.push({
        updateOne: {
          filter: {
            userId: userIdObj,
            itemType: update.itemType,
            refId: new Types.ObjectId(update.refId),
          },
          update: {
            $set: {
              currentTimeSec: update.currentTimeSec,
              durationSec: update.durationSec,
              completedPct: update.completedPct,
              lastUpdated: update.lastUpdated,
              syncedAt: new Date(),
            },
          },
          upsert: true,
        },
      });
    }

    if (operations.length > 0) {
      await this.progressModel.bulkWrite(operations);
    }

    return { updated, skipped };
  }
}
