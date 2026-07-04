import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';

import { User, UserDocument } from './schemas/user.schema';

@Injectable()
export class UserService {
  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  async findByEmail(email: string) {
    return this.userModel
      .findOne({
        email: email.toLowerCase(),
        isActive: true,
      })
      .select('+password');
  }

  async findById(id: string) {
    return this.userModel.findById(id).select('+refreshToken +refreshTokenJti');
  }

  async updateRefreshToken(userId: string, refreshToken: string, refreshTokenJti: string) {
    const result = await this.userModel.updateOne(
      { _id: userId },
      {
        $set: {
          refreshToken,
          refreshTokenJti,
        },
      },
    );
    return result;
  }

  async updateRefreshTokenAtomic(
    userId: string,
    oldJti: string,
    refreshToken: string,
    refreshTokenJti: string,
  ) {
    const result = await this.userModel.updateOne(
      { _id: userId, refreshTokenJti: oldJti },
      {
        $set: {
          refreshToken,
          refreshTokenJti,
        },
      },
    );
    return result;
  }

  async clearRefreshToken(userId: string): Promise<void> {
    await this.userModel.updateOne(
      { _id: userId },
      {
        $set: {
          refreshToken: null,
          refreshTokenJti: null,
        },
      },
    );
  }

  async countUsers() {
    return this.userModel.countDocuments();
  }

  async create(data: Partial<User>) {
    const existing = await this.userModel.findOne({
      email: data.email?.toLowerCase(),
    });

    if (existing) {
      throw new BadRequestException('User with this email already exists');
    }

    const hashedPassword = await bcrypt.hash(data.password!, 10);
    return this.userModel.create({
      ...data,
      password: hashedPassword,
    });
  }
}
