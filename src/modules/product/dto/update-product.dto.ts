import { Type } from 'class-transformer';
import { OmitType, PartialType } from '@nestjs/mapped-types';
import {
    IsArray,
    IsInt,
    IsOptional,
    IsPositive,
    ValidateNested,
} from 'class-validator';
import { CreateProductDto, CreateProductVariantDto } from './create-product.dto';

export class UpdateVariantDto extends PartialType(CreateProductVariantDto) {
    @IsInt()
    @IsPositive()
    id: number;
}

export class VariantChangesDto {
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateProductVariantDto)
    create?: CreateProductVariantDto[];

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => UpdateVariantDto)
    update?: UpdateVariantDto[];

    @IsOptional()
    @IsArray()
    @IsInt({ each: true })
    @IsPositive({ each: true })
    delete?: number[];
}

export class UpdateProductDto extends PartialType(
    OmitType(CreateProductDto, ['variants'] as const),
) {
    @IsOptional()
    @ValidateNested()
    @Type(() => VariantChangesDto)
    variants?: VariantChangesDto;
}

