import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { FulfillmentType } from '../../../../generated/prisma/enums';

function trimString({ value }: { value: unknown }) {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateOrderDto {
  @Transform(trimString)
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  fullName: string;

  @Transform(trimString)
  @IsString()
  @Matches(/^\+?[0-9\s-]{6,20}$/, {
    message: 'phone must be a valid phone number',
  })
  phone: string;

  @IsEnum(FulfillmentType)
  fulfillmentType: FulfillmentType;

  @ValidateIf(
    (dto: CreateOrderDto) =>
      dto.fulfillmentType === FulfillmentType.DELIVERY ||
      dto.address !== undefined,
  )
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  address?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(500)
  note?: string;
}
