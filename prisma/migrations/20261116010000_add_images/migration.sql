BEGIN;
CREATE TABLE "images" (
  "id" SERIAL PRIMARY KEY,
  "url" TEXT NOT NULL,
  "storage_key" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "images_storage_key_key" ON "images"("storage_key");

CREATE TABLE "product_images" (
  "product_id" INTEGER NOT NULL,
  "image_id" INTEGER NOT NULL,
  "position" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "product_images_pkey" PRIMARY KEY ("product_id", "image_id"),
  CONSTRAINT "product_images_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "product_images_image_id_fkey" FOREIGN KEY ("image_id") REFERENCES "images"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "product_images_image_id_idx" ON "product_images"("image_id");

CREATE TABLE "image_file_deletions" (
  "storage_key" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "image_file_deletions_pkey" PRIMARY KEY ("storage_key")
);

-- Keep every existing product picture as the first image of that product's gallery.
-- These are external URLs, so they have no storage_key and no file to clean up.
CREATE TEMP TABLE "product_image_backfill" ON COMMIT DROP AS
SELECT
  "id" AS "product_id",
  "image_url",
  nextval(pg_get_serial_sequence('"images"', 'id')) AS "image_id"
FROM "products"
WHERE "image_url" IS NOT NULL;

INSERT INTO "images" ("id", "url")
SELECT "image_id", "image_url" FROM "product_image_backfill";

INSERT INTO "product_images" ("product_id", "image_id", "position")
SELECT "product_id", "image_id", 0 FROM "product_image_backfill";

ALTER TABLE "products" DROP COLUMN "image_url";

-- Removing a link (directly, or by cascade from a product or shop delete) drops the image once nothing links to it.
CREATE FUNCTION "delete_unlinked_image"() RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "product_images" WHERE "image_id" = OLD."image_id") THEN
    DELETE FROM "images" WHERE "id" = OLD."image_id";
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "product_images_delete_unlinked_image"
AFTER DELETE ON "product_images"
FOR EACH ROW EXECUTE FUNCTION "delete_unlinked_image"();

-- The database cannot delete files, so it queues them; the app removes queued files from storage.
CREATE FUNCTION "queue_image_file_deletion"() RETURNS TRIGGER AS $$
BEGIN
  IF OLD."storage_key" IS NOT NULL THEN
    INSERT INTO "image_file_deletions" ("storage_key") VALUES (OLD."storage_key")
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "images_queue_file_deletion"
AFTER DELETE ON "images"
FOR EACH ROW EXECUTE FUNCTION "queue_image_file_deletion"();
COMMIT;
