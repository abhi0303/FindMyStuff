import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SearchQueryDto } from './dto/search-query.dto';
import { SearchService } from './search.service';
import { ApiOkResponse } from '@nestjs/swagger';
import { SearchResponse } from './dto/search-response.dto';
import { SkipThrottle } from '@nestjs/throttler';

@ApiTags('search')
@ApiBearerAuth()
// This app registers a second, much tighter named throttler ('auth',
// 10 req/5min) for signup/login. @nestjs/throttler applies EVERY
// registered throttler to EVERY route by default, so without this every
// endpoint here silently inherited that 10-request ceiling on top of the
// intended 300/min 'default' bucket — which is what caused normal
// browsing to 429 after only 10 calls to any single route. Skip it here;
// only AuthController's specific routes opt back in via @Throttle({ auth }).
@SkipThrottle({ auth: true })
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  @ApiOperation({
    summary: 'Find a thing across every place you can see',
    description:
      'Typo-tolerant: "almira" finds "Almirah". Alias-aware: "charger" finds "Type-C cable". ' +
      'Each result comes back with the full breadcrumb of where it is kept.',
  })
  @ApiOkResponse({ type: SearchResponse })
  search(@CurrentUser('id') userId: string, @Query() query: SearchQueryDto) {
    return this.searchService.search(userId, query);
  }
}
