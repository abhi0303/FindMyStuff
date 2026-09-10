import { ApiProperty } from '@nestjs/swagger';
import { FriendshipStatus } from '@prisma/client';
import { UserCard } from '../../common/dto/response.dto';

export class FriendshipResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: FriendshipStatus })
  status!: FriendshipStatus;

  @ApiProperty({ nullable: true, example: 'Hi Mummy, adding you' })
  message!: string | null;

  @ApiProperty({ type: UserCard })
  requester!: UserCard;

  @ApiProperty({ type: UserCard })
  addressee!: UserCard;

  @ApiProperty({ nullable: true, format: 'date-time' })
  respondedAt!: Date | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;
}

/** GET /friends — already resolved to "the other person". */
export class FriendResponse {
  @ApiProperty({ format: 'uuid' })
  friendshipId!: string;

  @ApiProperty({ nullable: true, format: 'date-time' })
  since!: Date | null;

  @ApiProperty({ type: UserCard, description: 'The other person, whoever sent the request' })
  user!: UserCard;
}
