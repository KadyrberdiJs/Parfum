import {
  IsEnum,
  IsInt,
  IsString,
  Max,
  MaxLength,
  Min,
  NotEquals,
  Matches,
} from 'class-validator';
import { StockMovementType } from '../../../../generated/prisma/enums';
export class StockMovementDto {
  @IsEnum(StockMovementType)
  type: StockMovementType;
  @IsInt()
  @Min(-2147483647)
  @Max(2147483647)
  @NotEquals(0)
  deltaMl: number;
  @IsString()
  @Matches(/\S/, { message: 'note must explain the stock movement' })
  @MaxLength(500)
  note: string;
}
