-- Data migration: scrub bcrypt hashes that were written into log.changes by the
-- change-password flows (dispatcher.password.changed, and the technician flow
-- that mislabelled its rows as dispatcher.password.changed before it was fixed
-- to technician.password.changed). The application now writes the placeholder
-- form { "password": { "old": "[hashed]", "new": "[hashed]" } }; this rewrites
-- every existing row that carries a top-level "password" key to match,
-- whatever its event_type.
--
-- Idempotent: rows already holding the placeholder are skipped, and every other
-- key in `changes` is preserved (jsonb || only replaces the "password" entry).

UPDATE "log"
SET "changes" = "changes" || '{"password": {"old": "[hashed]", "new": "[hashed]"}}'::jsonb
WHERE "changes" IS NOT NULL
  AND jsonb_typeof("changes") = 'object'
  AND "changes" ? 'password'
  AND "changes" -> 'password' IS DISTINCT FROM '{"old": "[hashed]", "new": "[hashed]"}'::jsonb;
