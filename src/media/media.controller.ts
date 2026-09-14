import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateMediaDto } from './dto/create-media.dto';
import { MediaService } from './media.service';
import { ApiCreatedResponse, ApiOkResponse, ApiProduces } from '@nestjs/swagger';
import { MediaResponse } from './dto/media-response.dto';
import { SuccessResponse } from '../common/dto/response.dto';
import { SkipThrottle } from '@nestjs/throttler';

@ApiTags('media')
@ApiBearerAuth()
// This app registers a second, much tighter named throttler ('auth',
// 10 req/5min) for signup/login. @nestjs/throttler applies EVERY
// registered throttler to EVERY route by default, so without this every
// endpoint here silently inherited that 10-request ceiling on top of the
// intended 300/min 'default' bucket — which is what caused normal
// browsing to 429 after only 10 calls to any single route. Skip it here;
// only AuthController's specific routes opt back in via @Throttle({ auth }).
@SkipThrottle({ auth: true })
@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post()
  @ApiOperation({ summary: 'Upload a base64 image and get a media id back' })
  @ApiCreatedResponse({ type: MediaResponse })
  async upload(@CurrentUser('id') userId: string, @Body() dto: CreateMediaDto) {
    // Internal storage keys never leave the server; clients address media by id.
    const {
      storageKey: _storageKey,
      thumbnailKey: _thumbnailKey,
      ...media
    } = await this.mediaService.createFromBase64(userId, dto.base64);
    return media;
  }

  @Get(':id')
  @ApiOperation({ summary: 'Media metadata' })
  @ApiOkResponse({ type: MediaResponse })
  metadata(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.mediaService.metadata(userId, id);
  }

  @Get(':id/raw')
  @Header('Cache-Control', 'private, max-age=86400')
  @ApiOperation({ summary: 'Original image bytes' })
  @ApiProduces('image/jpeg', 'image/png', 'image/webp')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  async raw(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const { buffer, mimeType } = await this.mediaService.read(userId, id, 'original');
    res.type(mimeType).send(buffer);
  }

  @Get(':id/thumbnail')
  @Header('Cache-Control', 'private, max-age=86400')
  @ApiOperation({ summary: 'Thumbnail bytes — use this in lists' })
  @ApiProduces('image/webp')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  async thumbnail(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const { buffer, mimeType } = await this.mediaService.read(userId, id, 'thumbnail');
    res.type(mimeType).send(buffer);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete your own media' })
  @ApiOkResponse({ type: SuccessResponse })
  remove(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.mediaService.remove(userId, id);
  }
}
