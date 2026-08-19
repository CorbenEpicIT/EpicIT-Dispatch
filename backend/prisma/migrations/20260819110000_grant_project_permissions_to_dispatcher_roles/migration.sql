-- Data migration: grant the new project permissions to existing dispatcher-tier roles.
--
-- The Projects feature introduced view/create/edit/delete_projects, but roles created
-- before that release never received them, so non-admin dispatchers got 403s on
-- /projects until an admin edited every role by hand. Each project permission is
-- granted to any dispatcher-tier role that already holds the equivalent job permission:
--   view_jobs   -> view_projects
--   create_jobs -> create_projects
--   edit_jobs   -> edit_projects
--   delete_jobs -> delete_projects
--
-- Idempotent: a permission is only appended when the role does not already hold it, so
-- re-running this never duplicates entries. Technician-tier roles are never touched
-- (technicians are hard-denied from projects).
--
-- NOTE: permissions are baked into the JWT at login. Users must log out and back in
-- (or wait for their access token to expire and refresh) before the new permissions
-- take effect.

UPDATE "organization_role"
SET "permissions" = array_append("permissions", 'view_projects')
WHERE "base_tier" = 'dispatcher'
  AND 'view_jobs' = ANY("permissions")
  AND NOT ('view_projects' = ANY("permissions"));

UPDATE "organization_role"
SET "permissions" = array_append("permissions", 'create_projects')
WHERE "base_tier" = 'dispatcher'
  AND 'create_jobs' = ANY("permissions")
  AND NOT ('create_projects' = ANY("permissions"));

UPDATE "organization_role"
SET "permissions" = array_append("permissions", 'edit_projects')
WHERE "base_tier" = 'dispatcher'
  AND 'edit_jobs' = ANY("permissions")
  AND NOT ('edit_projects' = ANY("permissions"));

UPDATE "organization_role"
SET "permissions" = array_append("permissions", 'delete_projects')
WHERE "base_tier" = 'dispatcher'
  AND 'delete_jobs' = ANY("permissions")
  AND NOT ('delete_projects' = ANY("permissions"));
