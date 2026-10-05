-- =============================================================================
-- Database roles — the two-role connection model
-- =============================================================================
--
-- This file is mounted into the PostgreSQL container's
-- `/docker-entrypoint-initdb.d/` (plan 01-04 wires the Compose mount), so it
-- runs exactly once at cluster initialization, BEFORE any migration. The roles
-- must exist before `20260101000100_append_only_grants` can grant to them.
--
-- THE POINT OF TWO ROLES (TechArch/04-security.md §7.3):
--
--   app_dba  owns the schema and runs migrations. It holds DDL rights, which
--            means it can alter or drop the audit table. It is NEVER used by
--            running request-handling code.
--
--   app_rw   is the running application's role. It holds no UPDATE and no
--            DELETE grant on append-only tables, and no DELETE grant on ANY
--            table in the platform schema.
--
-- §7.3 is explicit about why the separation has to be at the role level rather
-- than enforced by the ORM: PostgreSQL "will reject the statement regardless of
-- which code path generated it, including a compromised application process or
-- an operator using the application's own credentials." An application that
-- connected as app_dba would still pass every test and would silently hold the
-- power to rewrite history — which is why PrismaService asserts its own
-- `current_user` at boot rather than trusting configuration.
--
-- CREDENTIALS: the passwords below are LOCAL DEVELOPMENT ONLY and exist so a
-- `docker compose up` works with no manual step. `TechArch/05-tech-stack.md`
-- §8.4 requires that production resolve both from the secrets manager with "no
-- credentials embedded in code or container images"; `.env.example` says the
-- same next to DATABASE_URL and MIGRATION_DATABASE_URL. These two strings must
-- never appear in a deployed environment.
-- =============================================================================

CREATE ROLE app_dba LOGIN PASSWORD 'app_dba_local_dev';
CREATE ROLE app_rw  LOGIN PASSWORD 'app_rw_local_dev';

-- app_dba owns and migrates the database.
GRANT ALL PRIVILEGES ON DATABASE judicialsync TO app_dba;

-- app_rw may connect and nothing more until the grant migration runs. Starting
-- from no privileges and granting deliberately is the order that keeps an
-- accidental DELETE grant from surviving review.
GRANT CONNECT ON DATABASE judicialsync TO app_rw;
