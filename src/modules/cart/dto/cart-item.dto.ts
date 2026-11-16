import { IsInt, Max, Min } from 'class-validator';
export class SetCartQuantityDto {
  @IsInt()
  @Min(1)
  @Max(99)
  quantity: number;
}
export class AddCartItemDto extends SetCartQuantityDto {
  @IsInt()
  @Min(1)
  @Max(2147483647)
  variantId: number;
}
