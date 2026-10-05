import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type HydratedDocument, Types } from 'mongoose';

export type LibraryItemDocument = HydratedDocument<LibraryItem>;

@Schema({ timestamps: true })
export class LibraryItem {
  @Prop({ required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, enum: ['movie', 'series'], index: true })
  type: 'movie' | 'series';

  @Prop({ required: true, trim: true, index: true })
  title: string;

  @Prop({ min: 1900, max: 2100 })
  year?: number;

  @Prop()
  posterUrl?: string;

  @Prop()
  backdropUrl?: string;

  @Prop({ required: true })
  r2Key: string;

  @Prop({ type: Types.ObjectId, ref: 'Series' })
  seriesId?: Types.ObjectId;

  @Prop()
  folderPath?: string;

  @Prop()
  subtitleKey?: string;

  @Prop({ min: 0 })
  durationSec?: number;

  @Prop({ min: 0 })
  fileSize?: number;

  @Prop({ required: true, default: 'mp4' })
  format: 'mp4';

  @Prop({ required: true, default: false })
  watched: boolean;

  @Prop()
  lastSeenAt?: Date;
}

export const LibraryItemSchema = SchemaFactory.createForClass(LibraryItem);
LibraryItemSchema.index({ userId: 1, r2Key: 1 }, { unique: true });
LibraryItemSchema.index({ userId: 1, type: 1, title: 1 });
