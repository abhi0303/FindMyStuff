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
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PlaceRoles } from '../common/decorators/place-roles.decorator';
import { PlaceMemberGuard } from '../common/guards/place-member.guard';
import { CreateStorageDto } from './dto/create-storage.dto';
import { QueryStorageDto } from './dto/query-storage.dto';
import { UpdateStorageDto } from './dto/update-storage.dto';
import { StoragesService } from './storages.service';
import { ApiCreatedResponse, ApiOkResponse } from '@nestjs/swagger';
import {
  StorageDeletedResponse,
  StorageDetailResponse,
  StorageListItemResponse,
  StorageNodeResponse,
  StorageResponse,
} from './dto/storage-response.dto';

@ApiTags('storages')
@ApiBearerAuth()
@Controller()
export class StoragesController {
  constructor(private readonly storagesService: StoragesService) {}

  @Get('storages/by-label/:labelCode')
  @ApiOperation({ summary: 'Look up a storage by its QR sticker code, across all your places' })
  @ApiOkResponse({ type: StorageDetailResponse })
  findByLabel(@CurrentUser('id') userId: string, @Param('labelCode') labelCode: string) {
    return this.storagesService.findByLabel(userId, labelCode);
  }

  @Post('places/:placeId/storages')
  @UseGuards(PlaceMemberGuard)
  @PlaceRoles(MemberRole.MEMBER)
  @ApiOperation({ summary: 'Add a storage. Pass parentId to nest it inside another one.' })
  @ApiCreatedResponse({ type: StorageResponse })
  create(
    @CurrentUser('id') userId: string,
    @Param('placeId', ParseUUIDPipe) placeId: string,
    @Body() dto: CreateStorageDto,
  ) {
    return this.storagesService.create(userId, placeId, dto);
  }

  @Get('places/:placeId/storages')
  @UseGuards(PlaceMemberGuard)
  @ApiOperation({ summary: 'Flat list of storages — this feeds the dropdown when adding a thing' })
  @ApiOkResponse({ type: [StorageListItemResponse] })
  findAll(
    @CurrentUser('id') userId: string,
    @Param('placeId', ParseUUIDPipe) placeId: string,
    @Query() query: QueryStorageDto,
  ) {
    return this.storagesService.findAll(userId, placeId, query);
  }

  @Get('places/:placeId/storages/tree')
  @UseGuards(PlaceMemberGuard)
  @ApiOperation({ summary: 'Nested tree of every storage in the place' })
  @ApiOkResponse({ type: [StorageNodeResponse] })
  tree(@CurrentUser('id') userId: string, @Param('placeId', ParseUUIDPipe) placeId: string) {
    return this.storagesService.tree(userId, placeId);
  }

  @Get('places/:placeId/storages/:storageId')
  @UseGuards(PlaceMemberGuard)
  @ApiOperation({ summary: 'One storage with its children and the items inside it' })
  @ApiOkResponse({ type: StorageDetailResponse })
  findOne(
    @CurrentUser('id') userId: string,
    @Param('placeId', ParseUUIDPipe) placeId: string,
    @Param('storageId', ParseUUIDPipe) storageId: string,
  ) {
    return this.storagesService.findOne(userId, placeId, storageId);
  }

  @Patch('places/:placeId/storages/:storageId')
  @UseGuards(PlaceMemberGuard)
  @PlaceRoles(MemberRole.MEMBER)
  @ApiOperation({ summary: 'Rename, edit, or move a storage (with its whole subtree)' })
  @ApiOkResponse({ type: StorageResponse })
  update(
    @CurrentUser('id') userId: string,
    @Param('placeId', ParseUUIDPipe) placeId: string,
    @Param('storageId', ParseUUIDPipe) storageId: string,
    @Body() dto: UpdateStorageDto,
  ) {
    return this.storagesService.update(userId, placeId, storageId, dto);
  }

  @Delete('places/:placeId/storages/:storageId')
  @UseGuards(PlaceMemberGuard)
  @PlaceRoles(MemberRole.ADMIN)
  @ApiOperation({ summary: 'Delete a storage and its subtree; items inside become unassigned' })
  @ApiOkResponse({ type: StorageDeletedResponse })
  remove(
    @CurrentUser('id') userId: string,
    @Param('placeId', ParseUUIDPipe) placeId: string,
    @Param('storageId', ParseUUIDPipe) storageId: string,
  ) {
    return this.storagesService.remove(userId, placeId, storageId);
  }
}
