-- Records that a tag's chip has been made permanently read-only.
-- Irreversible on the hardware, so it is tracked rather than assumed.

ALTER TYPE "public"."TagEventType" ADD VALUE IF NOT EXISTS 'LOCKED';
ALTER TYPE "public"."TagEventType" ADD VALUE IF NOT EXISTS 'LOCK_FAILED';

ALTER TABLE "public"."Tag" ADD COLUMN IF NOT EXISTS "lockedAt" TIMESTAMP(3);
