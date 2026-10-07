import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type HydratedDocument, Types } from 'mongoose';

export type EpisodeDocument = HydratedDocument<Episode>;

@Schema({ timestamps: true })
export class Episode {
  @Prop({ required: true, index: true })
  seasonId: Types.ObjectId;

  @Prop({ required: true, index: true })
  seriesId: Types.ObjectId;

  @Prop({ required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ required: true, min: 0 })
  number: number;

  @Prop({ min: 0 })
  episodeNumber?: number;

  @Prop({ required: true })
  r2Key: string;

  @Prop()
  subtitleKey?: string;

  @Prop({ min: 0 })
  durationSec?: number;

  @Prop({ min: 0 })
  fileSize?: number;

  @Prop()
  stillUrl?: string;

  @Prop({ required: true, default: false })
  watched: boolean;

  @Prop({ required: true, default: 0 })
  progressSec: number;

  @Prop({ required: true, default: 0 })
  lastPos: number;
}

export const EpisodeSchema = SchemaFactory.createForClass(Episode);
EpisodeSchema.index({ userId: 1, r2Key: 1 }, { unique: true });
EpisodeSchema.index({ userId: 1, seriesId: 1, seasonId: 1, number: 1 });
