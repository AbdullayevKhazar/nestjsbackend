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
    return this.userModel.findOne({ email }).select('+password +refreshToken');
  }

  async countUsers() {
    return this.userModel.countDocuments();
  }

  async create(data: Partial<User>) {
    return this.userModel.create(data);
  }
}
