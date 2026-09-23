-- Adds an automatic-inactivity-reset source to the mastery audit trail.
-- Applied directly against the dev database via a raw ALTER TYPE (not
-- `prisma migrate dev`) because the shadow database used to validate
-- migrations fails to replay pre-existing migration history
-- (20260802170000_add_audit_logs -- P1014, unrelated to this change).
ALTER TYPE "MasterySource" ADD VALUE IF NOT EXISTS 'DECAY';
