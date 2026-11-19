BEGIN;

ALTER TABLE "stock_movements" ALTER COLUMN "actor_id" DROP NOT NULL;

CREATE TYPE "FulfillmentType" AS ENUM ('DELIVERY', 'PICKUP');
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED');

CREATE TABLE "orders" (
  "id" SERIAL PRIMARY KEY,
  "shop_id" INTEGER NOT NULL REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "shop_name" TEXT NOT NULL,
  "user_id" INTEGER REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "full_name" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "address" TEXT,
  "note" TEXT,
  "fulfillment_type" "FulfillmentType" NOT NULL,
  "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
  "items_total" DECIMAL(10, 2) NOT NULL,
  "delivery_fee" DECIMAL(10, 2) NOT NULL,
  "total" DECIMAL(10, 2) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);

CREATE INDEX "orders_shop_id_id_idx" ON "orders"("shop_id", "id");
CREATE INDEX "orders_user_id_id_idx" ON "orders"("user_id", "id");

CREATE TABLE "order_items" (
  "id" SERIAL PRIMARY KEY,
  "order_id" INTEGER NOT NULL REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "product_id" INTEGER NOT NULL REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "variant_id" INTEGER REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "product_name" TEXT NOT NULL,
  "brand" TEXT,
  "image_url" TEXT,
  "sku" TEXT,
  "ml" INTEGER NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unit_price" DECIMAL(10, 2) NOT NULL,
  "line_total" DECIMAL(10, 2) NOT NULL
);

CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");
CREATE INDEX "order_items_product_id_idx" ON "order_items"("product_id");

COMMIT;
