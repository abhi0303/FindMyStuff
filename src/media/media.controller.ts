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

@ApiTags('media')
@ApiBearerAuth()
@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post()
  @ApiOperation({ summary: 'Upload a base64 image and get a media id back' })
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
  metadata(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.mediaService.metadata(userId, id);
  }

  @Get(':id/raw')
  @Header('Cache-Control', 'private, max-age=86400')
  @ApiOperation({ summary: 'Original image bytes' })
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
  remove(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.mediaService.remove(userId, id);
  }
}
