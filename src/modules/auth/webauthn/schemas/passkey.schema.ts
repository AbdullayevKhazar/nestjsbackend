import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type PasskeyDocument = HydratedDocument<Passkey>;

@Schema({ timestamps: true })
export class Passkey {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ required: true, unique: true })
  credentialId!: string;

  @Prop({ required: true })
  publicKey!: string;

  @Prop({ required: true, default: 0 })
  counter!: number;

  @Prop({ type: [String], default: [] })
  transports!: string[];

  @Prop({
    type: String,
    enum: ['singleDevice', 'multiDevice'],
    default: 'singleDevice',
  })
  deviceType!: 'singleDevice' | 'multiDevice';

  @Prop({ default: false })
  backedUp!: boolean;

  createdAt!: Date;
  updatedAt!: Date;
}

export const PasskeySchema = SchemaFactory.createForClass(Passkey);

PasskeySchema.index({ userId: 1, credentialId: 1 }, { unique: true });
