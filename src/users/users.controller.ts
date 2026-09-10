import { Body, Controller, Delete, Get, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Patch('me')
  @ApiOperation({ summary: 'Update your profile' })
  updateProfile(@CurrentUser('id') userId: string, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(userId, dto);
  }

  @Get('lookup')
  @ApiOperation({ summary: 'Find someone by their exact email, to send a friend request' })
  lookup(@Query('email') email: string) {
    return this.usersService.findByEmail(email);
  }

  @Delete('me')
  @ApiOperation({ summary: 'Deactivate your account' })
  deactivate(@CurrentUser('id') userId: string) {
    return this.usersService.deactivate(userId);
  }
}
