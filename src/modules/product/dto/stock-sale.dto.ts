import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
export class StockSaleItemDto {
  @IsInt()
  @Min(1)
  @Max(2147483647)
  variantId: number;
  @IsInt()
  @Min(1)
  @Max(10000)
  quantity: number;
}
export class StockSaleDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => StockSaleItemDto)
  items: StockSaleItemDto[];
  @IsString()
  @Matches(/\S/)
  @MaxLength(500)
  note: string;
}
