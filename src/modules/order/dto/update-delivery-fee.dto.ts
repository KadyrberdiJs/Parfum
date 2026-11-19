import { IsNumber, Max, Min } from 'class-validator';

export const MIN_DELIVERY_FEE_TMT = 20;

export class UpdateDeliveryFeeDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(MIN_DELIVERY_FEE_TMT)
  @Max(99999999.99)
  deliveryFee: number;
}
