BEGIN;
CREATE TABLE "carts" (
  "id" SERIAL PRIMARY KEY,
  "user_id" INTEGER UNIQUE REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "guest_token_hash" TEXT UNIQUE,
  "expires_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "carts_owner_check" CHECK (
    ("user_id" IS NOT NULL AND "guest_token_hash" IS NULL AND "expires_at" IS NULL) OR
    ("user_id" IS NULL AND "guest_token_hash" IS NOT NULL AND "expires_at" IS NOT NULL)
  )
);
CREATE INDEX "carts_expires_at_idx" ON "carts"("expires_at");
CREATE TABLE "cart_items" (
  "id" SERIAL PRIMARY KEY,
  "cart_id" INTEGER NOT NULL REFERENCES "carts"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "variant_id" INTEGER NOT NULL REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "quantity" INTEGER NOT NULL CHECK ("quantity" BETWEEN 1 AND 99),
  CONSTRAINT "cart_items_cart_id_variant_id_key" UNIQUE ("cart_id", "variant_id")
);
CREATE INDEX "cart_items_variant_id_idx" ON "cart_items"("variant_id");
COMMIT;
