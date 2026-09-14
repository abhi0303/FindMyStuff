import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { MemberRole } from '@prisma/client';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PlaceRoles } from '../common/decorators/place-roles.decorator';
import { PlaceMemberGuard } from '../common/guards/place-member.guard';
import { AcceptInviteDto } from './dto/accept-invite.dto';
import { AddMemberDto } from './dto/add-member.dto';
import { CreateInviteDto } from './dto/create-invite.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { MembersService } from './members.service';
import { ApiCreatedResponse, ApiOkResponse } from '@nestjs/swagger';
import { PlaceInviteResponse, PlaceMemberResponse } from '../places/dto/place-response.dto';
import { SuccessResponse } from '../common/dto/response.dto';
import { SkipThrottle } from '@nestjs/throttler';

@ApiTags('members')
@ApiBearerAuth()
// This app registers a second, much tighter named throttler ('auth',
// 10 req/5min) for signup/login. @nestjs/throttler applies EVERY
// registered throttler to EVERY route by default, so without this every
// endpoint here silently inherited that 10-request ceiling on top of the
// intended 300/min 'default' bucket — which is what caused normal
// browsing to 429 after only 10 calls to any single route. Skip it here;
// only AuthController's specific routes opt back in via @Throttle({ auth }).
@SkipThrottle({ auth: true })
@Controller()
export class MembersController {
  constructor(private readonly membersService: MembersService) {}

  @Post('invites/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Redeem an invite code and join that place' })
  @ApiOkResponse({ type: PlaceMemberResponse })
  acceptInvite(@CurrentUser('id') userId: string, @Body() dto: AcceptInviteDto) {
    return this.membersService.acceptInvite(userId, dto);
  }

  @Get('places/:placeId/members')
  @UseGuards(PlaceMemberGuard)
  @ApiOperation({ summary: 'Everyone with access to this place' })
  @ApiOkResponse({ type: [PlaceMemberResponse] })
  list(@Param('placeId', ParseUUIDPipe) placeId: string) {
    return this.membersService.list(placeId);
  }

  @Post('places/:placeId/members')
  @UseGuards(PlaceMemberGuard)
  @PlaceRoles(MemberRole.ADMIN)
  @ApiOperation({ summary: 'Add an accepted friend to this place' })
  @ApiCreatedResponse({ type: PlaceMemberResponse })
  add(
    @CurrentUser('id') userId: string,
    @Param('placeId', ParseUUIDPipe) placeId: string,
    @Body() dto: AddMemberDto,
  ) {
    return this.membersService.add(userId, placeId, dto);
  }

  @Patch('places/:placeId/members/:memberId')
  @UseGuards(PlaceMemberGuard)
  @PlaceRoles(MemberRole.OWNER)
  @ApiOperation({ summary: 'Change what someone can do in this place' })
  @ApiOkResponse({ type: PlaceMemberResponse })
  updateRole(
    @CurrentUser('id') userId: string,
    @Param('placeId', ParseUUIDPipe) placeId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Body() dto: UpdateMemberDto,
  ) {
    return this.membersService.updateRole(userId, placeId, memberId, dto);
  }

  @Delete('places/:placeId/members/:memberId')
  @UseGuards(PlaceMemberGuard)
  @PlaceRoles(MemberRole.ADMIN)
  @ApiOperation({ summary: 'Remove someone from this place' })
  @ApiOkResponse({ type: SuccessResponse })
  remove(
    @CurrentUser('id') userId: string,
    @Param('placeId', ParseUUIDPipe) placeId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
  ) {
    return this.membersService.remove(userId, placeId, memberId);
  }

  @Post('places/:placeId/leave')
  @UseGuards(PlaceMemberGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Leave a place you were added to' })
  @ApiOkResponse({ type: SuccessResponse })
  leave(@CurrentUser('id') userId: string, @Param('placeId', ParseUUIDPipe) placeId: string) {
    return this.membersService.leave(userId, placeId);
  }

  @Post('places/:placeId/invites')
  @UseGuards(PlaceMemberGuard)
  @PlaceRoles(MemberRole.ADMIN)
  @ApiOperation({ summary: 'Create an invite code for someone not on the app yet' })
  @ApiCreatedResponse({ type: PlaceInviteResponse })
  createInvite(
    @CurrentUser('id') userId: string,
    @Param('placeId', ParseUUIDPipe) placeId: string,
    @Body() dto: CreateInviteDto,
  ) {
    return this.membersService.createInvite(userId, placeId, dto);
  }

  @Get('places/:placeId/invites')
  @UseGuards(PlaceMemberGuard)
  @PlaceRoles(MemberRole.ADMIN)
  @ApiOperation({ summary: 'Invite codes that are still open' })
  @ApiOkResponse({ type: [PlaceInviteResponse] })
  listInvites(@Param('placeId', ParseUUIDPipe) placeId: string) {
    return this.membersService.listInvites(placeId);
  }

  @Delete('places/:placeId/invites/:inviteId')
  @UseGuards(PlaceMemberGuard)
  @PlaceRoles(MemberRole.ADMIN)
  @ApiOperation({ summary: 'Revoke an unused invite code' })
  @ApiOkResponse({ type: SuccessResponse })
  revokeInvite(
    @Param('placeId', ParseUUIDPipe) placeId: string,
    @Param('inviteId', ParseUUIDPipe) inviteId: string,
  ) {
    return this.membersService.revokeInvite(placeId, inviteId);
  }
}
