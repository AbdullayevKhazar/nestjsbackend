import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

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
    return this.userModel
      .findOne({
        _id: id,
        isActive: true,
      })
      .select('+refreshToken');
  }

  async updateRefreshToken(userId: string, refreshToken: string) {
    console.log('Updating user:', userId);

    const result = await this.userModel.updateOne(
      { _id: userId },
      {
        $set: {
          refreshToken,
        },
      },
    );

    console.log(result);

    const user = await this.userModel.findById(userId).select('+refreshToken');

    console.log('Stored:', user?.refreshToken);

    return user;
  }

  async clearRefreshToken(userId: string): Promise<void> {
    await this.userModel.updateOne(
      { _id: userId },
      {
        $set: {
          refreshToken: null,
        },
      },
    );
  }

  async countUsers() {
    return this.userModel.countDocuments();
  }

  async create(data: Partial<User>) {
    return this.userModel.create(data);
  }
}
