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
import { MemberRole, PlaceMember } from '@prisma/client';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Membership } from '../common/decorators/membership.decorator';
import { PlaceRoles } from '../common/decorators/place-roles.decorator';
import { PlaceMemberGuard } from '../common/guards/place-member.guard';
import { CreateItemDto } from './dto/create-item.dto';
import { LendItemDto } from './dto/lend-item.dto';
import { MoveItemDto } from './dto/move-item.dto';
import { QueryItemDto } from './dto/query-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { ItemsService } from './items.service';

@ApiTags('items')
@ApiBearerAuth()
@Controller()
export class ItemsController {
  constructor(private readonly itemsService: ItemsService) {}

  @Get('items/attention')
  @ApiOperation({
    summary: 'Expiring, out-of-warranty, overdue-to-return and low-stock items everywhere',
  })
  attention(@CurrentUser('id') userId: string, @Query('withinDays') withinDays?: string) {
    return this.itemsService.attention(userId, withinDays ? Number(withinDays) : undefined);
  }

  @Post('places/:placeId/items')
  @UseGuards(PlaceMemberGuard)
  @PlaceRoles(MemberRole.MEMBER)
  @ApiOperation({ summary: 'Add a thing and say which storage it went into' })
  create(
    @CurrentUser('id') userId: string,
    @Param('placeId', ParseUUIDPipe) placeId: string,
    @Body() dto: CreateItemDto,
  ) {
    return this.itemsService.create(userId, placeId, dto);
  }

  @Get('places/:placeId/items')
  @UseGuards(PlaceMemberGuard)
  @ApiOperation({ summary: 'List and filter the things in a place' })
  findAll(
    @CurrentUser('id') userId: string,
    @Param('placeId', ParseUUIDPipe) placeId: string,
    @Query() query: QueryItemDto,
  ) {
    return this.itemsService.findAll(userId, placeId, query);
  }

  @Get('places/:placeId/items/:itemId')
  @UseGuards(PlaceMemberGuard)
  @ApiOperation({ summary: 'One thing, with its photos and recent movements' })
  findOne(
    @CurrentUser('id') userId: string,
    @Param('placeId', ParseUUIDPipe) placeId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ) {
    return this.itemsService.findOne(userId, placeId, itemId);
  }

  @Get('places/:placeId/items/:itemId/history')
  @UseGuards(PlaceMemberGuard)
  @ApiOperation({ summary: 'Everywhere this thing has been kept' })
  history(
    @CurrentUser('id') userId: string,
    @Param('placeId', ParseUUIDPipe) placeId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ) {
    return this.itemsService.history(userId, placeId, itemId);
  }

  @Patch('places/:placeId/items/:itemId')
  @UseGuards(PlaceMemberGuard)
  @ApiOperation({ summary: 'Edit a thing' })
  update(
    @CurrentUser('id') userId: string,
    @Param('placeId', ParseUUIDPipe) placeId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Membership() membership: PlaceMember,
    @Body() dto: UpdateItemDto,
  ) {
    return this.itemsService.update(userId, placeId, itemId, membership.role, dto);
  }

  @Post('places/:placeId/items/:itemId/move')
  @UseGuards(PlaceMemberGuard)
  @ApiOperation({ summary: 'Move a thing to another storage' })
  move(
    @CurrentUser('id') userId: string,
    @Param('placeId', ParseUUIDPipe) placeId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Membership() membership: PlaceMember,
    @Body() dto: MoveItemDto,
  ) {
    return this.itemsService.move(userId, placeId, itemId, membership.role, dto);
  }

  @Post('places/:placeId/items/:itemId/lend')
  @UseGuards(PlaceMemberGuard)
  @ApiOperation({ summary: 'Mark a thing as lent out' })
  lend(
    @CurrentUser('id') userId: string,
    @Param('placeId', ParseUUIDPipe) placeId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Membership() membership: PlaceMember,
    @Body() dto: LendItemDto,
  ) {
    return this.itemsService.lend(userId, placeId, itemId, membership.role, dto);
  }

  @Post('places/:placeId/items/:itemId/return')
  @UseGuards(PlaceMemberGuard)
  @ApiOperation({ summary: 'Mark a lent thing as returned' })
  returnItem(
    @CurrentUser('id') userId: string,
    @Param('placeId', ParseUUIDPipe) placeId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Membership() membership: PlaceMember,
  ) {
    return this.itemsService.returnItem(userId, placeId, itemId, membership.role);
  }

  @Delete('places/:placeId/items/:itemId')
  @UseGuards(PlaceMemberGuard)
  @ApiOperation({ summary: 'Soft-delete a thing' })
  remove(
    @CurrentUser('id') userId: string,
    @Param('placeId', ParseUUIDPipe) placeId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Membership() membership: PlaceMember,
  ) {
    return this.itemsService.remove(userId, placeId, itemId, membership.role);
  }
}
