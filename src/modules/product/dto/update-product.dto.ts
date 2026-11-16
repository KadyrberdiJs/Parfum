import { Type } from 'class-transformer';
import { OmitType, PartialType } from '@nestjs/mapped-types';
import {
  IsArray,
  ArrayMaxSize,
  ArrayUnique,
  ValidateIf,
  IsInt,
  IsOptional,
  IsPositive,
  ValidateNested,
} from 'class-validator';
import {
  CreateProductDto,
  CreateProductVariantDto,
} from './create-product.dto';

export class UpdateVariantDto extends PartialType(CreateProductVariantDto, {
  skipNullProperties: false,
}) {
  @IsInt()
  @IsPositive()
  id: number;
}

export class VariantChangesDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CreateProductVariantDto)
  create?: CreateProductVariantDto[];

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => UpdateVariantDto)
  update?: UpdateVariantDto[];

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsInt({ each: true })
  @IsPositive({ each: true })
  delete?: number[];
}

export class UpdateProductDto extends PartialType(
  OmitType(CreateProductDto, ['variants', 'shopId', 'stockMl'] as const),
  { skipNullProperties: false },
) {
  @IsOptional()
  @ValidateNested()
  @Type(() => VariantChangesDto)
  variants?: VariantChangesDto;
}
