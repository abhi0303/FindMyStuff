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

@ApiTags('places')
@ApiBearerAuth()
@Controller('places')
export class PlacesController {
  constructor(
    private readonly placesService: PlacesService,
    private readonly activityService: ActivityService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a house / office / locker' })
  create(@CurrentUser('id') userId: string, @Body() dto: CreatePlaceDto) {
    return this.placesService.create(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Places you own or that are shared with you' })
  findAll(@CurrentUser('id') userId: string) {
    return this.placesService.findAllForUser(userId);
  }

  @Get(':placeId')
  @UseGuards(PlaceMemberGuard)
  @ApiOperation({ summary: 'One place with its members and counts' })
  findOne(@CurrentUser('id') userId: string, @Param('placeId', ParseUUIDPipe) placeId: string) {
    return this.placesService.findOne(userId, placeId);
  }

  @Patch(':placeId')
  @UseGuards(PlaceMemberGuard)
  @PlaceRoles(MemberRole.ADMIN)
  @ApiOperation({ summary: 'Update place details' })
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
  remove(@CurrentUser('id') userId: string, @Param('placeId', ParseUUIDPipe) placeId: string) {
    return this.placesService.remove(userId, placeId);
  }

  @Get(':placeId/activity')
  @UseGuards(PlaceMemberGuard)
  @ApiOperation({ summary: 'Who did what in this place' })
  activity(@Param('placeId', ParseUUIDPipe) placeId: string, @Query() pagination: PaginationDto) {
    return this.activityService.listForPlace(placeId, pagination);
  }
}
