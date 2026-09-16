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
| 20260916112*   | pin_relocation_transition |
| 20260916112*   | verify_world_login_rpcs |
| 20260916113*   | default_campaign_for_new_worlds |
| 20260916114*   | cutover_drop_legacy_pin_columns |
| 20260916114*   | verify_post_cutover_login |
| 20260916114*   | cleanup_test_worlds_and_prune_attempts |

The PIN cutover is complete. See `docs/campaigns-schema-design.md` §5.6-5.7.
