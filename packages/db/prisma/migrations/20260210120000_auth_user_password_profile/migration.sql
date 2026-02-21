-- Add password hash to users
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_hash" TEXT;

-- Add user relation to user_profiles
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "user_id" TEXT;

-- Create index for user_id
CREATE INDEX IF NOT EXISTS "user_profiles_user_id_idx" ON "user_profiles"("user_id");

-- Add foreign key constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_profiles_user_id_fkey'
  ) THEN
    ALTER TABLE "user_profiles"
      ADD CONSTRAINT "user_profiles_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END$$;
