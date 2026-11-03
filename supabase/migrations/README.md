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
| 20260919005538 | reapply_analytics_overview_after_restore |
| 20260919005601 | reapply_feedback_reports_after_restore |
| 20260919005701 | world_session_lockdown |
| 20260919023225 | fix_current_world_execute_grant |
| 20260919023310 | verify_world_session_lockdown |
| 20260919040313 | remove_bait_worlds_left_by_probing |
| 20260920022447 | verify_login_still_works_after_lockdown |
| 20261103102913 | security_hardening |
| 20261103102917 | verify_security_hardening |
| 20261103103934 | advisor_cleanup |
| 20261103105850 | live_updates |
| 20261103105854 | verify_live_updates |
| 20261103113540 | altcha |
| 20261103113543 | verify_altcha (superseded, not kept) |
| 20261103113644 | verify_altcha_null_safe |
| 20261103120607 | owlbear (not yet applied) |
| 20261103120611 | verify_owlbear (not yet run) |

The PIN cutover is complete. See `docs/campaigns-schema-design.md` §5.6-5.7.

The `2026-09-19` lockdown and the `2026-11-03` hardening are the response to the
2026-09-18 incident, and every file from `20260919005701` on is kept here in
full. They were applied to the project first and copied here afterwards. The
two `reapply_*` entries re-ran the two files above after the restore and are
not duplicated. See `docs/campaigns-schema-design.md` §11.3a19-11.3a20.

The `verify_*` files raise on any failure and roll back everything they
create, so they are safe to re-run against production after any change to a
policy, grant or limit.

Since `altcha`, `world_login` and `world_create` refuse any call without a
solved challenge. The login and creation checks in `verify_security_hardening`
therefore stop at `captcha_required`; `verify_altcha_null_safe` restates them
with minted payloads. Re-run that one, together with `verify_live_updates`.
`20261103113543_verify_altcha` was replaced by `verify_altcha_null_safe` the
same hour. It compared results with `<>`, and a check that wrongly succeeds
returns a null error, so those assertions could not fail.

`20260918033024_analytics_overview_checks_by_focus.sql` is kept here in full,
because it is the only function that reads the DM-only campaign layer on behalf
of a caller who cannot. It supersedes `20260918032350` entirely (the earlier one
grouped checks on `ability` alone, which reported 11 of 12 as unset). See
`docs/campaigns-schema-design.md` §11.3a16.

`20260918062251_feedback_reports.sql` is kept here in full too. It is the only
table the anon key may write to without a world PIN behind it, so the policy
shape (insert-only, with `is_read`/`is_archived` pinned in the WITH CHECK) is
the thing to read before changing anything about it.

`20261103120607_owlbear` is the one exception to "this directory is the
record": it was written alongside the Owlbear Rodeo extension and has not been
applied yet. Apply it, then run `verify_owlbear` and `verify_live_updates`.
Both verify files roll back what they create. Until it is applied, the
extension asks the GM for the player PIN once, and enemy HP bars refresh on a
timer rather than live. Once applied, remove "(not yet applied)" from the
table and this paragraph. See `docs/campaigns-schema-design.md` §11.3a23.
