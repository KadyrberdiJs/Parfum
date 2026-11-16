import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { OptionalAuth } from '../../common/decorators/optional-auth.decorator';
import {
  CurrentUser,
  type AuthUser,
} from '../../common/decorators/current-user.decorator';
import { AddCartItemDto, SetCartQuantityDto } from './dto/cart-item.dto';
import { CartService } from './cart.service';
import { CartSession, type CartRequest } from './cart-session';
import { CartRequestGuard } from './cart-request.guard';

@Controller('cart')
@OptionalAuth()
@UseGuards(CartRequestGuard)
export class CartController {
  constructor(
    private readonly carts: CartService,
    private readonly session: CartSession,
  ) {}

  @Get()
  read(@Req() request: CartRequest) {
    return this.carts.read(this.session.identity(request));
  }

  @Post('items')
  async add(
    @Req() request: CartRequest,
    @Res({ passthrough: true }) response: Response,
    @Body() dto: AddCartItemDto,
  ) {
    const result = await this.carts.add(this.session.identity(request), dto);
    this.session.save(response, result.guestToken);
    return result.cart;
  }

  @Patch('items/:id')
  async setQuantity(
    @Req() request: CartRequest,
    @Res({ passthrough: true }) response: Response,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetCartQuantityDto,
  ) {
    const result = await this.carts.setQuantity(
      this.session.identity(request),
      id,
      dto.quantity,
    );
    this.session.save(response, result.guestToken);
    return result.cart;
  }

  @Delete('items/:id')
  async remove(
    @Req() request: CartRequest,
    @Res({ passthrough: true }) response: Response,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const result = await this.carts.remove(this.session.identity(request), id);
    this.session.save(response, result.guestToken);
    return result.cart;
  }

  @Delete()
  async clear(
    @Req() request: CartRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.carts.clear(this.session.identity(request));
    this.session.save(response, result.guestToken);
    return result.cart;
  }

  @Post('merge')
  @HttpCode(200)
  @OptionalAuth(false)
  async merge(
    @CurrentUser() user: AuthUser,
    @Req() request: CartRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const cart = await this.carts.merge(
      user.id,
      this.session.guestToken(request),
    );
    this.session.clear(response);
    return cart;
  }

  @Get('guest')
  readGuest(@Req() request: CartRequest) {
    return this.carts.read({ guestToken: this.session.guestToken(request) });
  }

  @Patch('guest/items/:id')
  async setGuestQuantity(
    @Req() request: CartRequest,
    @Res({ passthrough: true }) response: Response,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetCartQuantityDto,
  ) {
    const result = await this.carts.setQuantity(
      { guestToken: this.session.guestToken(request) },
      id,
      dto.quantity,
    );
    this.session.save(response, result.guestToken);
    return result.cart;
  }

  @Delete('guest/items/:id')
  async removeGuest(
    @Req() request: CartRequest,
    @Res({ passthrough: true }) response: Response,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const result = await this.carts.remove(
      { guestToken: this.session.guestToken(request) },
      id,
    );
    this.session.save(response, result.guestToken);
    return result.cart;
  }
}
