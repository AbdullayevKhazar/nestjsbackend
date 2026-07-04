import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

@Schema({
  timestamps: true,
})
export class User {
  @Prop({
    required: true,
    trim: true,
  })
  fullName!: string;

  @Prop({
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  })
  email!: string;

  @Prop({
    required: true,
    select: false,
  })
  password!: string;

  @Prop({
    default: true,
  })
  isActive!: boolean;

  @Prop({
    type: String,
    default: null,
    select: false,
  })
  refreshToken!: string | null;

  @Prop({
    type: String,
    default: null,
    select: false,
  })
  refreshTokenJti!: string | null;
}

export const UserSchema = SchemaFactory.createForClass(User);

UserSchema.index({ email: 1 }, { unique: true });
