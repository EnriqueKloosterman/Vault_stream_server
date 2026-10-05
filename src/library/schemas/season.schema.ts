import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type HydratedDocument, Types } from 'mongoose';

export type SeasonDocument = HydratedDocument<Season>;

@Schema({ timestamps: true })
export class Season {
  @Prop({ required: true, index: true })
  seriesId: Types.ObjectId;

  @Prop({ required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, min: 0 })
  number: number;

  @Prop()
  title?: string;
}

export const SeasonSchema = SchemaFactory.createForClass(Season);
SeasonSchema.index({ userId: 1, seriesId: 1, number: 1 }, { unique: true });
