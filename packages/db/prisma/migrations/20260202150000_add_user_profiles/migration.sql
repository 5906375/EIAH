-- CreateTable
CREATE TABLE "user_profiles" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "full_name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "cep" TEXT,
    "company" TEXT,
    "role" TEXT,
    "website" TEXT,
    "city" TEXT,
    "country" TEXT,
    "tenant_id" TEXT,
    "workspace_id" TEXT,
    "token" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_profiles_group_id_idx" ON "user_profiles"("group_id");
