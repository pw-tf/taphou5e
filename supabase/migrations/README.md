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
| 20260916222904 | encounter_combatant_color_notes_group |
| 20260916232428 | encounter_sharing |
| 20260916232539 | fix_combatant_reference_cascade |
| 20260916232609 | verify_sharing_and_cascade |
| 20260917060636 | dm_prose_to_notes_and_rename_chapters |
| 20260917061030 | rename_leftover_chapter_constraints |
| 20260918032350 | analytics_overview_aggregates |
| 20260918033024 | analytics_overview_checks_by_focus |
| 20260918062251 | feedback_reports |

The PIN cutover is complete. See `docs/campaigns-schema-design.md` §5.6-5.7.

`20260918033024_analytics_overview_checks_by_focus.sql` is kept here in full,
because it is the only function that reads the DM-only campaign layer on behalf
of a caller who cannot. It supersedes `20260918032350` entirely (the earlier one
grouped checks on `ability` alone, which reported 11 of 12 as unset). See
`docs/campaigns-schema-design.md` §11.3a16.

`20260918062251_feedback_reports.sql` is kept here in full too. It is the only
table the anon key may write to without a world PIN behind it, so the policy
shape (insert-only, with `is_read`/`is_archived` pinned in the WITH CHECK) is
the thing to read before changing anything about it.
