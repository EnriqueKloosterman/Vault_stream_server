import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type HydratedDocument, Types } from 'mongoose';

export type DownloadDocument = HydratedDocument<Download>;

@Schema({ timestamps: true })
export class Download {
  _id: Types.ObjectId;

  @Prop({ required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, enum: ['movie', 'episode'] })
  itemType: 'movie' | 'episode';

  @Prop({ required: true, type: Types.ObjectId })
  refId: Types.ObjectId;

  @Prop({ required: true })
  localPath: string;

  @Prop({ required: true })
  r2Key: string;

  @Prop({ min: 0 })
  fileSize?: number;

  @Prop({
    required: true,
    enum: ['pending', 'downloading', 'completed', 'error'],
    default: 'pending',
    index: true,
  })
  status: 'pending' | 'downloading' | 'completed' | 'error';

  @Prop({ min: 0, max: 100, default: 0 })
  progressPct: number;

  @Prop()
  error?: string;

  @Prop({ required: true, index: true })
  expiresAt: Date;
}

export const DownloadSchema = SchemaFactory.createForClass(Download);
DownloadSchema.index({ userId: 1, status: 1 });
DownloadSchema.index(
  { userId: 1, itemType: 1, refId: 1 },
  { unique: true },
);
