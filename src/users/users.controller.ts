import { Body, Controller, Delete, Get, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UsersService } from './users.service';
import { ApiOkResponse } from '@nestjs/swagger';
import { UserProfileResponse } from '../auth/dto/auth-response.dto';
import { SuccessResponse, UserCard } from '../common/dto/response.dto';
import { SkipThrottle } from '@nestjs/throttler';

@ApiTags('users')
@ApiBearerAuth()
// This app registers a second, much tighter named throttler ('auth',
// 10 req/5min) for signup/login. @nestjs/throttler applies EVERY
// registered throttler to EVERY route by default, so without this every
// endpoint here silently inherited that 10-request ceiling on top of the
// intended 300/min 'default' bucket — which is what caused normal
// browsing to 429 after only 10 calls to any single route. Skip it here;
// only AuthController's specific routes opt back in via @Throttle({ auth }).
@SkipThrottle({ auth: true })
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Patch('me')
  @ApiOperation({ summary: 'Update your profile' })
  @ApiOkResponse({ type: UserProfileResponse })
  updateProfile(@CurrentUser('id') userId: string, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(userId, dto);
  }

  @Get('lookup')
  @ApiOperation({ summary: 'Find someone by their exact email, to send a friend request' })
  @ApiOkResponse({ type: UserCard })
  lookup(@Query('email') email: string) {
    return this.usersService.findByEmail(email);
  }

  @Delete('me')
  @ApiOperation({ summary: 'Deactivate your account' })
  @ApiOkResponse({ type: SuccessResponse })
  deactivate(@CurrentUser('id') userId: string) {
    return this.usersService.deactivate(userId);
  }
}
