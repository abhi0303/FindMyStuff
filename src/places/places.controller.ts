import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { MemberRole } from '@prisma/client';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ActivityService } from '../activity/activity.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PlaceRoles } from '../common/decorators/place-roles.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';
import { PlaceMemberGuard } from '../common/guards/place-member.guard';
import { CreatePlaceDto } from './dto/create-place.dto';
import { UpdatePlaceDto } from './dto/update-place.dto';
import { PlacesService } from './places.service';
import { ApiCreatedResponse, ApiOkResponse } from '@nestjs/swagger';
import {
  ActivityLogResponse,
  PlaceDetailResponse,
  PlaceListItemResponse,
  PlaceResponse,
} from './dto/place-response.dto';
import { SuccessResponse } from '../common/dto/response.dto';
import { SkipThrottle } from '@nestjs/throttler';

@ApiTags('places')
@ApiBearerAuth()
// This app registers a second, much tighter named throttler ('auth',
// 10 req/5min) for signup/login. @nestjs/throttler applies EVERY
// registered throttler to EVERY route by default, so without this every
// endpoint here silently inherited that 10-request ceiling on top of the
// intended 300/min 'default' bucket — which is what caused normal
// browsing to 429 after only 10 calls to any single route. Skip it here;
// only AuthController's specific routes opt back in via @Throttle({ auth }).
@SkipThrottle({ auth: true })
@Controller('places')
export class PlacesController {
  constructor(
    private readonly placesService: PlacesService,
    private readonly activityService: ActivityService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a house / office / locker' })
  @ApiCreatedResponse({ type: PlaceResponse })
  create(@CurrentUser('id') userId: string, @Body() dto: CreatePlaceDto) {
    return this.placesService.create(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Places you own or that are shared with you' })
  @ApiOkResponse({ type: [PlaceListItemResponse] })
  findAll(@CurrentUser('id') userId: string) {
    return this.placesService.findAllForUser(userId);
  }

  @Get(':placeId')
  @UseGuards(PlaceMemberGuard)
  @ApiOperation({ summary: 'One place with its members and counts' })
  @ApiOkResponse({ type: PlaceDetailResponse })
  findOne(@CurrentUser('id') userId: string, @Param('placeId', ParseUUIDPipe) placeId: string) {
    return this.placesService.findOne(userId, placeId);
  }

  @Patch(':placeId')
  @UseGuards(PlaceMemberGuard)
  @PlaceRoles(MemberRole.ADMIN)
  @ApiOperation({ summary: 'Update place details' })
  @ApiOkResponse({ type: PlaceResponse })
  update(
    @CurrentUser('id') userId: string,
    @Param('placeId', ParseUUIDPipe) placeId: string,
    @Body() dto: UpdatePlaceDto,
  ) {
    return this.placesService.update(userId, placeId, dto);
  }

  @Delete(':placeId')
  @UseGuards(PlaceMemberGuard)
  @PlaceRoles(MemberRole.OWNER)
  @ApiOperation({ summary: 'Soft-delete a place and everything inside it' })
  @ApiOkResponse({ type: SuccessResponse })
  remove(@CurrentUser('id') userId: string, @Param('placeId', ParseUUIDPipe) placeId: string) {
    return this.placesService.remove(userId, placeId);
  }

  @Get(':placeId/activity')
  @UseGuards(PlaceMemberGuard)
  @ApiOperation({ summary: 'Who did what in this place' })
  @ApiOkResponse({ type: [ActivityLogResponse] })
  activity(@Param('placeId', ParseUUIDPipe) placeId: string, @Query() pagination: PaginationDto) {
    return this.activityService.listForPlace(placeId, pagination);
  }
}
