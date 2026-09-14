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
import { SkipThrottle } from '@nestjs/throttler';

@ApiTags('friends')
@ApiBearerAuth()
// This app registers a second, much tighter named throttler ('auth',
// 10 req/5min) for signup/login. @nestjs/throttler applies EVERY
// registered throttler to EVERY route by default, so without this every
// endpoint here silently inherited that 10-request ceiling on top of the
// intended 300/min 'default' bucket — which is what caused normal
// browsing to 429 after only 10 calls to any single route. Skip it here;
// only AuthController's specific routes opt back in via @Throttle({ auth }).
@SkipThrottle({ auth: true })
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
