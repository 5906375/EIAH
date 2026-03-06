/*
  Warnings:

  - The `status` column on the `proof_of_usage` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `failure_reason` column on the `proof_of_usage` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `created_at` on the `run_execution_locks` table. All the data in the column will be lost.
  - Changed the type of `decision` on the `approval_records` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "PoUStatus" AS ENUM ('PENDING', 'FINALIZED', 'FAILED', 'PENDING_TRUST');

-- CreateEnum
CREATE TYPE "PoUFailureReason" AS ENUM ('DB_WRITE_FAILED', 'VALIDATION_ERROR', 'SIGNER_ERROR', 'OUTPUT_UNAVAILABLE', 'HASH_ERROR', 'ATTESTATION_FAILED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ApprovalDecision" AS ENUM ('APPROVED', 'REJECTED');

-- AlterEnum
ALTER TYPE "RunStatus" ADD VALUE 'awaiting_approval';

-- DropForeignKey
ALTER TABLE "agent_installs" DROP CONSTRAINT "agent_installs_installed_by_user_id_fkey";

-- DropForeignKey
ALTER TABLE "agent_installs" DROP CONSTRAINT "agent_installs_tenant_id_fkey";

-- DropForeignKey
ALTER TABLE "agent_installs" DROP CONSTRAINT "agent_installs_workspace_id_fkey";

-- DropForeignKey
ALTER TABLE "connector_instances" DROP CONSTRAINT "connector_instances_created_by_user_id_fkey";

-- DropForeignKey
ALTER TABLE "connector_instances" DROP CONSTRAINT "connector_instances_tenant_id_fkey";

-- DropForeignKey
ALTER TABLE "connector_instances" DROP CONSTRAINT "connector_instances_workspace_id_fkey";

-- DropForeignKey
ALTER TABLE "role_permissions" DROP CONSTRAINT "role_permissions_role_id_fkey";

-- DropForeignKey
ALTER TABLE "tenant_memberships" DROP CONSTRAINT "tenant_memberships_custom_role_id_fkey";

-- DropForeignKey
ALTER TABLE "tenant_memberships" DROP CONSTRAINT "tenant_memberships_tenant_id_fkey";

-- DropForeignKey
ALTER TABLE "tenant_memberships" DROP CONSTRAINT "tenant_memberships_user_id_fkey";

-- DropForeignKey
ALTER TABLE "tenant_role_customs" DROP CONSTRAINT "tenant_role_customs_tenant_id_fkey";

-- DropForeignKey
ALTER TABLE "wallet_identities" DROP CONSTRAINT "wallet_identities_tenant_id_fkey";

-- DropForeignKey
ALTER TABLE "wallet_identities" DROP CONSTRAINT "wallet_identities_user_id_fkey";

-- AlterTable
ALTER TABLE "agent_installs" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "approval_records" DROP COLUMN "decision",
ADD COLUMN     "decision" "ApprovalDecision" NOT NULL;

-- AlterTable
ALTER TABLE "connector_instances" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "proof_of_usage" DROP COLUMN "status",
ADD COLUMN     "status" "PoUStatus" NOT NULL DEFAULT 'PENDING',
DROP COLUMN "failure_reason",
ADD COLUMN     "failure_reason" "PoUFailureReason";

-- AlterTable
ALTER TABLE "role_permissions" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "run_execution_locks" DROP COLUMN "created_at",
ALTER COLUMN "holder_id" DROP DEFAULT,
ALTER COLUMN "expires_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "tenant_memberships" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "tenant_role_customs" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- DropEnum
DROP TYPE "approval_decision";

-- DropEnum
DROP TYPE "pou_failure_reason";

-- DropEnum
DROP TYPE "pou_status";

-- AddForeignKey
ALTER TABLE "wallet_identities" ADD CONSTRAINT "wallet_identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_identities" ADD CONSTRAINT "wallet_identities_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_memberships" ADD CONSTRAINT "tenant_memberships_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_memberships" ADD CONSTRAINT "tenant_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_memberships" ADD CONSTRAINT "tenant_memberships_custom_role_id_fkey" FOREIGN KEY ("custom_role_id") REFERENCES "tenant_role_customs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_role_customs" ADD CONSTRAINT "tenant_role_customs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "tenant_role_customs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connector_instances" ADD CONSTRAINT "connector_instances_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connector_instances" ADD CONSTRAINT "connector_instances_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connector_instances" ADD CONSTRAINT "connector_instances_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_installs" ADD CONSTRAINT "agent_installs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_installs" ADD CONSTRAINT "agent_installs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_installs" ADD CONSTRAINT "agent_installs_installed_by_user_id_fkey" FOREIGN KEY ("installed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "uniq_run_execution_lock" RENAME TO "run_execution_locks_tenant_id_workspace_id_run_id_key";
