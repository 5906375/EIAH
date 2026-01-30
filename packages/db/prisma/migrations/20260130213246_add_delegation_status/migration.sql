-- CreateEnum
CREATE TYPE "DelegationStatus" AS ENUM ('pending_approval', 'active', 'rejected', 'revoked');

-- AlterTable
ALTER TABLE "delegation_policies" ADD COLUMN     "decided_at" TIMESTAMP(3),
ADD COLUMN     "provider_signature_hash" TEXT,
ADD COLUMN     "status" "DelegationStatus" NOT NULL DEFAULT 'pending_approval';
