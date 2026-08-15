import {
    IsEmail,
    IsInt,
    IsOptional,
    IsPositive,
    IsString,
    IsUrl,
    Matches,
    MaxLength,
    MinLength,
} from 'class-validator';

export class CreateShopDto {
    @IsString()
    @MinLength(2)
    @MaxLength(100)
    name: string;

    @IsString()
    @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
        message: 'slug must contain only lowercase letters, numbers and hyphens',
    })
    @MaxLength(100)
    slug: string;

    @IsOptional()
    @IsString()
    @MaxLength(500)
    description?: string;

    @IsOptional()
    @IsUrl()
    logoUrl?: string;

    @IsOptional()
    @IsUrl()
    bannerUrl?: string;

    @IsEmail()
    email: string;

    @IsOptional()
    @IsString()
    @MaxLength(255)
    address?: string;

    @IsInt()
    @IsPositive()
    ownerId: number;
}
