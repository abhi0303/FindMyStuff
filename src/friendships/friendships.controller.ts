import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { FriendshipStatus } from '@prisma/client';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateFriendRequestDto } from './dto/create-friend-request.dto';
import { FriendshipsService } from './friendships.service';
import { ApiCreatedResponse, ApiOkResponse } from '@nestjs/swagger';
import { FriendResponse, FriendshipResponse } from './dto/friendship-response.dto';
import { SuccessResponse } from '../common/dto/response.dto';

@ApiTags('friends')
@ApiBearerAuth()
@Controller('friends')
export class FriendshipsController {
  constructor(private readonly friendships: FriendshipsService) {}

  @Get()
  @ApiOperation({ summary: 'People you are connected to' })
  @ApiOkResponse({ type: [FriendResponse] })
  list(@CurrentUser('id') userId: string) {
    return this.friendships.listFriends(userId);
  }

  @Post('requests')
  @ApiOperation({ summary: 'Send a friend request by email or user id' })
  @ApiCreatedResponse({ type: FriendshipResponse })
  send(@CurrentUser('id') userId: string, @Body() dto: CreateFriendRequestDto) {
    return this.friendships.sendRequest(userId, dto);
  }

  @Get('requests/incoming')
  @ApiOperation({ summary: 'Requests waiting for your answer' })
  @ApiOkResponse({ type: [FriendshipResponse] })
  incoming(@CurrentUser('id') userId: string) {
    return this.friendships.listRequests(userId, 'incoming');
  }

  @Get('requests/outgoing')
  @ApiOperation({ summary: 'Requests you have sent' })
  @ApiOkResponse({ type: [FriendshipResponse] })
  outgoing(@CurrentUser('id') userId: string) {
    return this.friendships.listRequests(userId, 'outgoing');
  }

  @Post('requests/:id/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept a friend request' })
  @ApiOkResponse({ type: FriendshipResponse })
  accept(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.friendships.respond(userId, id, FriendshipStatus.ACCEPTED);
  }

  @Post('requests/:id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject a friend request' })
  @ApiOkResponse({ type: FriendshipResponse })
  reject(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.friendships.respond(userId, id, FriendshipStatus.REJECTED);
  }

  @Delete(':userId')
  @ApiOperation({ summary: 'Disconnect from someone (place access is unaffected)' })
  @ApiOkResponse({ type: SuccessResponse })
  remove(@CurrentUser('id') userId: string, @Param('userId', ParseUUIDPipe) otherUserId: string) {
    return this.friendships.remove(userId, otherUserId);
  }

  @Post(':userId/block')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Block someone from contacting you' })
  @ApiOkResponse({ type: FriendshipResponse })
  block(@CurrentUser('id') userId: string, @Param('userId', ParseUUIDPipe) otherUserId: string) {
    return this.friendships.block(userId, otherUserId);
  }
}
