import { ApiProperty } from '@nestjs/swagger';
import { ItemResponse } from '../../items/dto/item-response.dto';
import { PlaceResponse } from '../../places/dto/place-response.dto';
import { StorageResponse } from '../../storages/dto/storage-response.dto';

export class SyncDeletedIds {
  @ApiProperty({ type: [String], format: 'uuid' })
  places!: string[];

  @ApiProperty({ type: [String], format: 'uuid' })
  storages!: string[];

  @ApiProperty({ type: [String], format: 'uuid' })
  items!: string[];
}

export class SyncResponse {
  @ApiProperty({
    format: 'date-time',
    description:
      'Store this and send it back as `since` on the next call — never the device clock. ' +
      'When `truncated` is true, this is NOT the actual current time: it is the cutoff up to ' +
      'which every array is guaranteed complete, so calling again with it is always safe and ' +
      'always makes progress. Calling again with the same `since` you just sent would not.',
  })
  serverTime!: string;

  @ApiProperty({ type: [PlaceResponse] })
  places!: PlaceResponse[];

  @ApiProperty({ type: [StorageResponse] })
  storages!: StorageResponse[];

  @ApiProperty({ type: [ItemResponse] })
  items!: ItemResponse[];

  @ApiProperty({ type: SyncDeletedIds })
  deleted!: SyncDeletedIds;

  @ApiProperty({
    description:
      'true if any array below hit the per-call cap and there are more changes ' +
      'not yet delivered. If so, call again right away with the `serverTime` ' +
      'this response returned (see its description) rather than waiting.',
    example: false,
  })
  truncated!: boolean;
}
