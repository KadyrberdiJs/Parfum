import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { ShopService } from './shop.service';
import { CreateShopDto } from './dto/create-shop.dto';
import { UpdateShopDto } from './dto/update-shop.dto';

@Controller('shops')
export class ShopController {
    constructor(private readonly shopService: ShopService) {};

    @Post()
    create(@Body() dto: CreateShopDto) {
        return this.shopService.create(dto);
    };

    @Get()
    findAll() {
        return this.shopService.findAll();
    };

    @Get(':id')
    findOne(@Param('id', ParseIntPipe) id: number) {
        return this.shopService.findOne(id);
    };

    @Patch(':id')
    update(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateShopDto) {
            return this.shopService.update(id, dto);
    };

    @Delete(':id')
    delete(@Param('id', ParseIntPipe) id: number) {
        return this.shopService.remove(id);
    };
}
