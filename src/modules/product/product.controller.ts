import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ProductStockService } from './product-stock.service';
import { StockMovementDto } from './dto/stock-movement.dto';
import { StockSaleDto } from './dto/stock-sale.dto';
import { ProductService } from './product.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import {
  type AuthUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { PaginationDto } from '../../common/pagination.dto';
import { UserRole } from '../../../generated/prisma/enums';
@Controller('products')
export class ProductController {
  constructor(
    private readonly productService: ProductService,
    private readonly stockService: ProductStockService,
  ) {}

  @Post(':id/stock-movements')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  adjustStock(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: StockMovementDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.stockService.adjust(id, dto, user);
  }

  @Get(':id/stock-movements')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  stockHistory(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
    @Query() query: PaginationDto,
  ) {
    return this.stockService.history(id, user, query);
  }

  @Post(':id/stock-sales')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  recordSale(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: StockSaleDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.stockService.sell(id, dto, user);
  }
  @Post()
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  create(@Body() dto: CreateProductDto, @CurrentUser() user: AuthUser) {
    return this.productService.create(dto, user);
  }
  @Get()
  @Public()
  findAll(@Query() query: PaginationDto) {
    return this.productService.findAll(query);
  }
  @Get('manage')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  findManaged(@CurrentUser() user: AuthUser, @Query() query: PaginationDto) {
    return this.productService.findManaged(user, query);
  }
  @Get(':id')
  @Public()
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.productService.findOne(id);
  }
  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProductDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.productService.update(id, dto, user);
  }
  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.productService.remove(id, user);
  }
}
