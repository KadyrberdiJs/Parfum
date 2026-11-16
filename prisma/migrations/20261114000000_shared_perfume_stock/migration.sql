BEGIN;
CREATE TABLE "legacy_variant_stock" (
  "variant_id" INTEGER PRIMARY KEY,
  "product_id" INTEGER NOT NULL,
  "ml" INTEGER NOT NULL,
  "stock" INTEGER NOT NULL
);
-- Preserve original counts without assuming that variants represented separate bottles.
INSERT INTO "legacy_variant_stock" SELECT "id", "product_id", "ml", "stock" FROM "product_variants";
ALTER TABLE "products" ADD COLUMN "stock_ml" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "products" ADD CONSTRAINT "products_stock_ml_nonnegative" CHECK ("stock_ml" >= 0);
ALTER TABLE "product_variants" DROP COLUMN "stock";
CREATE TYPE "StockMovementType" AS ENUM ('REFILL', 'SALE', 'RETURN', 'SPILLAGE', 'CORRECTION');
CREATE TABLE "stock_movements" (
  "id" SERIAL PRIMARY KEY,
  "product_id" INTEGER NOT NULL REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "type" "StockMovementType" NOT NULL,
  "delta_ml" INTEGER NOT NULL,
  "balance_ml" INTEGER NOT NULL,
  "actor_id" INTEGER NOT NULL,
  "note" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "stock_movements_balance_nonnegative" CHECK ("balance_ml" >= 0),
  CONSTRAINT "stock_movements_direction" CHECK (
    ("type" IN ('REFILL', 'RETURN') AND "delta_ml" > 0) OR
    ("type" IN ('SALE', 'SPILLAGE') AND "delta_ml" < 0) OR
    ("type" = 'CORRECTION' AND "delta_ml" <> 0)
  )
);
CREATE INDEX "stock_movements_product_id_id_idx" ON "stock_movements"("product_id", "id");
COMMIT;
