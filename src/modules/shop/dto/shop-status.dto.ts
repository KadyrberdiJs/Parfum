import { IsEnum } from 'class-validator';
import { Status } from '../../../../generated/prisma/enums';
export class ShopStatusDto {
  @IsEnum(Status) status: Status;
}
