import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ProductService } from './product.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { type AuthUser, CurrentUser } from 'src/common/decorators/current-user.decorator';

@Controller('products')
export class ProductController {
    constructor(private readonly productService: ProductService) {};

    @Post()
    create(@Body() dto: CreateProductDto) {
        return this.productService.create(dto);
    };

    @Get()
    findAll() {
        return this.productService.findAll();
    };

    @Get(':id')
    findOne(@Param('id', ParseIntPipe) id: number) {
        return this.productService.findOne(id);
    };

    @Patch(':id')
    @UseGuards(JwtAuthGuard)
    update(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateProductDto,
        @CurrentUser() user: AuthUser,
    ) {
            return this.productService.update(id, dto, user);
    };

    @Delete(':id')
    delete(
        @Param('id', ParseIntPipe) id: number,
        @CurrentUser() user: AuthUser,
    ) {
        return this.productService.remove(id, user);
    };
}
