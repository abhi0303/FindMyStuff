import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SearchQueryDto } from './dto/search-query.dto';
import { SearchService } from './search.service';
import { ApiOkResponse } from '@nestjs/swagger';
import { SearchResponse } from './dto/search-response.dto';

@ApiTags('search')
@ApiBearerAuth()
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
