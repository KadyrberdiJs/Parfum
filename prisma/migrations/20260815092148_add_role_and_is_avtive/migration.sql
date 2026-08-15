-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('super_admin', 'admin', 'cashier', 'courier', 'customer');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "role" "UserRole" NOT NULL DEFAULT 'customer';
