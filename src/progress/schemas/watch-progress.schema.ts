import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type HydratedDocument, Types } from 'mongoose';

export type WatchProgressDocument = HydratedDocument<WatchProgress>;

@Schema({ timestamps: true })
export class WatchProgress {
  _id: Types.ObjectId;

  @Prop({ required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, enum: ['movie', 'episode'] })
  itemType: 'movie' | 'episode';

  @Prop({ required: true, type: Types.ObjectId })
  refId: Types.ObjectId;

  @Prop({ required: true, default: 0, min: 0 })
  currentTimeSec: number;

  @Prop({ required: true, default: 0, min: 0 })
  durationSec: number;

  @Prop({ required: true, default: 0, min: 0, max: 100 })
  completedPct: number;

  @Prop({ required: true, index: true })
  lastUpdated: number;

  @Prop()
  syncedAt?: Date;
}

export const WatchProgressSchema = SchemaFactory.createForClass(WatchProgress);
WatchProgressSchema.index({ userId: 1, itemType: 1, refId: 1 }, { unique: true });
WatchProgressSchema.index({ userId: 1, lastUpdated: -1 });
