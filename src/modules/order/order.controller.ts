import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '../../../generated/prisma/enums';
import {
  CurrentUser,
  type AuthUser,
} from '../../common/decorators/current-user.decorator';
import { OptionalAuth } from '../../common/decorators/optional-auth.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { PaginationDto } from '../../common/pagination.dto';
import { CartRequestGuard } from '../cart/cart-request.guard';
import { CartSession } from '../cart/cart-session';
import type { CartRequest } from '../cart/cart.types';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateDeliveryFeeDto } from './dto/update-delivery-fee.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrderService } from './order.service';

@Controller('orders')
export class OrderController {
  constructor(
    private readonly orders: OrderService,
    private readonly session: CartSession,
  ) {}

  // Creates orders from the active cart (guest or logged-in) and deducts perfume stock.
  @Post()
  @OptionalAuth()
  @UseGuards(CartRequestGuard)
  placeOrder(@Req() request: CartRequest, @Body() dto: CreateOrderDto) {
    const owner = this.session.getCartOwner(request);
    return this.orders.placeOrder(owner, dto);
  }

  // Lists all orders placed by the current logged-in customer.
  @Get('my')
  findMyOrders(@CurrentUser() user: AuthUser, @Query() query: PaginationDto) {
    return this.orders.findMyOrders(user, query);
  }

  // Lists all orders across shops owned by the seller or super admin.
  @Get('manage')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  findManaged(@CurrentUser() user: AuthUser, @Query() query: PaginationDto) {
    return this.orders.findManaged(user, query);
  }

  // Retrieves order details by ID for the customer, seller, or super admin.
  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.orders.findOne(id, user);
  }

  // Updates order status (CONFIRMED, COMPLETED, CANCELLED) and returns stock if cancelled.
  @Patch(':id/status')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateOrderStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.orders.updateStatus(id, dto.status, user);
  }

  // Adjusts the delivery fee (minimum 20 TMT) on active delivery orders.
  @Patch(':id/delivery-fee')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  updateDeliveryFee(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDeliveryFeeDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.orders.updateDeliveryFee(id, dto.deliveryFee, user);
  }
}
