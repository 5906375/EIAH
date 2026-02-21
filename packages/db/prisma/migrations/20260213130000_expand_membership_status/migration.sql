-- Expand MembershipStatus enum for tenant lifecycle
DO $$ BEGIN
  ALTER TYPE "MembershipStatus" ADD VALUE IF NOT EXISTS 'INVITED';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "MembershipStatus" ADD VALUE IF NOT EXISTS 'PENDING';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "MembershipStatus" ADD VALUE IF NOT EXISTS 'SUSPENDED';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "MembershipStatus" ADD VALUE IF NOT EXISTS 'REJECTED';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
