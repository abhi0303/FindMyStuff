import { Module } from '@nestjs/common';
import { FriendshipsModule } from '../friendships/friendships.module';
import { MembersController } from './members.controller';
import { MembersService } from './members.service';

@Module({
  imports: [FriendshipsModule],
  controllers: [MembersController],
  providers: [MembersService],
})
export class MembersModule {}
