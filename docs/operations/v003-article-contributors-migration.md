# V003 article contributors migration and activation

Status: review artifact. This document defines the production sequence; it is not evidence that production has been executed.

## Scope

V003__article_contributors.sql creates the public contributor source and the revision-scoped ordered binding used by ArticleProjection.contributors[].

It is an expand-only migration:

- it does not rewrite existing publication rows;
- the public application role receives SELECT only;
- editorial write permissions belong to the separately reviewed publication workflow migration;
- there is no destructive down migration.

The migration version is reserved in the task plan. Future migration versions are V004 editorial workflow, V005 taxonomy/search, V006 reader library and V007 provenance.

## Preconditions

- PostgreSQL 18 is running with the native uuidv7() function.
- A privileged migration/bootstrap connection is available; do not run this file with the public application login.
- A tested backup or restore point exists for the target database.
- The release artifact contains the exact migration SHA and the API/web build that consumes the contributor projection.
- Staging has passed:

  bash scripts/test/verify-article-contributors-migration.sh

- The production migration history has no prior V003 entry and no contributor or article_contributor table created outside the migration.

## Forward activation sequence

1. Capture the target database identifier, migration history, backup/restore point and release SHA in the change record.
2. Apply V003__article_contributors.sql with the migration/bootstrap role in the same controlled transaction used by the repository migration runner.
3. Run the post-migration checks below. Stop if any check fails.
4. Deploy the API artifact that reads contributor and article_contributor.
5. Deploy the Nuxt artifact and run the public article smoke test:
   - published article returns contributors[];
   - contributor order follows position;
   - a draft/withdrawn article remains unavailable;
   - the response does not expose private contributor fields.
6. Activate the public article release only after API and web smoke checks pass.

## Post-migration checks

Run as a privileged verification connection, with values captured in the change record:

  SELECT to_regclass('public.contributor'),
         to_regclass('public.article_contributor');

  SELECT has_table_privilege(
    'courtside_app', 'public.contributor', 'SELECT'
  ) AS contributor_read,
  has_table_privilege(
    'courtside_app', 'public.contributor', 'INSERT'
  ) AS contributor_insert,
  has_table_privilege(
    'courtside_app', 'public.contributor', 'UPDATE'
  ) AS contributor_update;

  SELECT has_table_privilege(
    'courtside_app', 'public.article_contributor', 'SELECT'
  ) AS binding_read,
  has_table_privilege(
    'courtside_app', 'public.article_contributor', 'INSERT'
  ) AS binding_insert,
  has_table_privilege(
    'courtside_app', 'public.article_contributor', 'UPDATE'
  ) AS binding_update;

Expected result: both tables exist; SELECT is true; INSERT and UPDATE are false for courtside_app.

## Rollback and failure handling

- Before the migration commits: abort the migration transaction and do not deploy the new API/web artifact.
- After the migration commits but before application deployment: keep the empty expand-only tables, deploy the previous application image, and fix forward. Do not drop the tables in production.
- After application deployment: roll back the API/web image to the last image that does not query the new projection, keep the migration, and disable public activation until the corrected artifact passes staging.
- If contributor data is wrong, correct it through the future editorial workflow or a reviewed forward migration; do not mutate published source rows ad hoc.
- A normal Git revert is an application rollback only. It is not a database rollback and must not be presented as one.

## Evidence to record

- exact migration file SHA;
- database target/environment and migration-runner identity;
- backup/restore point;
- migration start/end time and migration history row;
- post-migration SQL output;
- API/web release SHAs;
- public smoke-test response and status;
- rollback decision or activation approval.

Production activation remains a protected operational gate until this evidence is attached to the release/change record.
