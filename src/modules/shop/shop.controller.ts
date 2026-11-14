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
import { ShopService } from './shop.service';
import { CreateShopDto } from './dto/create-shop.dto';
import { UpdateShopDto } from './dto/update-shop.dto';
import { ShopStatusDto } from './dto/shop-status.dto';
import {
  CurrentUser,
  type AuthUser,
} from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { PaginationDto } from '../../common/pagination.dto';
import { UserRole } from '../../../generated/prisma/enums';
@Controller('shops')
export class ShopController {
  constructor(private readonly shopService: ShopService) {}
  @Post()
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  create(@Body() dto: CreateShopDto, @CurrentUser() user: AuthUser) {
    return this.shopService.create(dto, user);
  }
  @Get()
  @Public()
  findAll(@Query() query: PaginationDto) {
    return this.shopService.findAll(query);
  }
  @Get('manage')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  findManaged(@CurrentUser() user: AuthUser, @Query() query: PaginationDto) {
    return this.shopService.findManaged(user, query);
  }
  @Get(':id')
  @Public()
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.shopService.findOne(id);
  }
  @Patch(':id/status')
  @Roles(UserRole.SUPER_ADMIN)
  setStatus(@Param('id', ParseIntPipe) id: number, @Body() dto: ShopStatusDto) {
    return this.shopService.setStatus(id, dto.status);
  }
  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateShopDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.shopService.update(id, dto, user);
  }
  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.shopService.remove(id, user);
  }
}
