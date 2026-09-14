import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SyncQueryDto } from './dto/sync-query.dto';
import { SyncResponse } from './dto/sync-response.dto';
import { SyncService } from './sync.service';

@ApiTags('sync')
@ApiBearerAuth()
@SkipThrottle({ auth: true })
@Controller('sync')
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Get()
  @ApiOperation({
    summary: 'Everything that changed since a given time — for offline backup',
    description:
      'Omit `since` for a first, full sync. On every later call, pass back the ' +
      '`serverTime` the PREVIOUS response returned — never the device clock, which ' +
      'can drift. Covers every place you are an active member of unless `placeId` ' +
      'narrows it to one. Respects the same PRIVATE-item visibility rule as every ' +
      'other endpoint: an item marked PRIVATE by someone else never appears here, ' +
      'whether it changed or was deleted.',
  })
  @ApiOkResponse({ type: SyncResponse })
  sync(@CurrentUser('id') userId: string, @Query() query: SyncQueryDto) {
    return this.syncService.sync(userId, query);
  }
}
