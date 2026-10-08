import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type HydratedDocument, Types } from 'mongoose';

export type SeriesDocument = HydratedDocument<Series>;

@Schema({ timestamps: true })
export class Series {
  @Prop({ required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, trim: true, index: true })
  title: string;

  @Prop({ required: true, trim: true, lowercase: true, index: true })
  normalizedTitle: string;

  @Prop({ min: 1900, max: 2100 })
  year?: number;

  @Prop()
  posterUrl?: string;

  @Prop()
  backdropUrl?: string;

  @Prop()
  synopsis?: string;

  @Prop()
  tmdbId?: number;

  @Prop()
  r2Prefix?: string;
}

export const SeriesSchema = SchemaFactory.createForClass(Series);
SeriesSchema.index({ userId: 1, title: 1 });
SeriesSchema.index({ userId: 1, normalizedTitle: 1 }, { unique: true });
