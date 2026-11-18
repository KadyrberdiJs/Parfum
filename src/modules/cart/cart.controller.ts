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
import { CartSession } from './cart-session';
import { CartRequestGuard } from './cart-request.guard';
import type { CartRequest } from './cart.types';

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
    return this.carts.read(this.session.getCartOwner(request));
  }

  @Post('items')
  async add(
    @Req() request: CartRequest,
    @Res({ passthrough: true }) response: Response,
    @Body() dto: AddCartItemDto,
  ) {
    const owner = this.session.getCartOwner(request);
    const result = await this.carts.add(owner, dto);
    if (result.guestToken)
      this.session.saveGuestToken(response, result.guestToken);
    return result.cart;
  }

  @Patch('items/:id')
  async setQuantity(
    @Req() request: CartRequest,
    @Res({ passthrough: true }) response: Response,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetCartQuantityDto,
  ) {
    const owner = this.session.getCartOwner(request);
    const result = await this.carts.setQuantity(owner, id, dto.quantity);
    if (result.guestToken)
      this.session.saveGuestToken(response, result.guestToken);
    return result.cart;
  }

  @Delete('items/:id')
  async remove(
    @Req() request: CartRequest,
    @Res({ passthrough: true }) response: Response,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const owner = this.session.getCartOwner(request);
    const result = await this.carts.remove(owner, id);
    if (result.guestToken)
      this.session.saveGuestToken(response, result.guestToken);
    return result.cart;
  }

  @Delete()
  async clear(
    @Req() request: CartRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const owner = this.session.getCartOwner(request);
    const result = await this.carts.clear(owner);
    if (result.guestToken)
      this.session.saveGuestToken(response, result.guestToken);
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
    const guestToken = this.session.readGuestToken(request);
    const cart = await this.carts.merge(user.id, guestToken);
    this.session.clearGuestToken(response);
    return cart;
  }

  @Get('guest')
  readGuest(@Req() request: CartRequest) {
    const guestToken = this.session.readGuestToken(request);
    return this.carts.read({ guestToken });
  }

  @Patch('guest/items/:id')
  async setGuestQuantity(
    @Req() request: CartRequest,
    @Res({ passthrough: true }) response: Response,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetCartQuantityDto,
  ) {
    const guestToken = this.session.readGuestToken(request);
    const result = await this.carts.setQuantity(
      { guestToken },
      id,
      dto.quantity,
    );
    if (result.guestToken)
      this.session.saveGuestToken(response, result.guestToken);
    return result.cart;
  }

  @Delete('guest/items/:id')
  async removeGuest(
    @Req() request: CartRequest,
    @Res({ passthrough: true }) response: Response,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const guestToken = this.session.readGuestToken(request);
    const result = await this.carts.remove({ guestToken }, id);
    if (result.guestToken)
      this.session.saveGuestToken(response, result.guestToken);
    return result.cart;
  }
}
