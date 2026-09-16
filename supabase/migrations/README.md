# Migrations

These files mirror the migrations applied to the Supabase project
(`zlsguyiwwwbyoqxdewsd`), recorded here so the schema history lives with the code.
Filenames match the `version` recorded in the project's migration table.

They were applied directly to the remote project; this directory is the record,
not a pending queue. Do not re-run them against that project.

| Version | Name |
|---|---|
| 20260916111102 | campaign_layer_core_tables |
| 20260916111135 | campaign_layer_security |
| 20260916111146 | campaign_layer_backfill |
| 20260916111258 | campaign_layer_hardening_and_triggers |
| 20260916111336 | verify_cross_world_membership_rejected |

Still to come, gated on a deploy (see `docs/campaigns-schema-design.md` §5.5):
PIN hash relocation and the RPC login functions.
