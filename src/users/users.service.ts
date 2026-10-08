import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, type UserDocument } from './schemas/user.schema.js';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
  ) {}

  async create(email: string, passwordHash: string): Promise<UserDocument> {
    return this.userModel.create({
      email: email.trim().toLowerCase(),
      passwordHash,
    });
  }

  async findByEmail(email: string): Promise<UserDocument | null> {
    if (typeof email !== 'string') {
      return null;
    }
    return this.userModel
      .findOne({ email: email.trim().toLowerCase() })
      .select('+passwordHash')
      .exec();
  }

  async findById(id: string): Promise<UserDocument | null> {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }
    return this.userModel.findById(id).exec();
  }
}
