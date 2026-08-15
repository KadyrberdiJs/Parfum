import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateUserDto {
    @IsOptional()
    @IsEmail()
    email?: string;

    @IsString()
    @MinLength(3)
    @MaxLength(100)
    username: string;

    @IsString()
    @MinLength(6)
    password: string;

    @IsString()
    @MinLength(5)
    @MaxLength(50)
    fullName: string;
}