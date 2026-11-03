// ========================================
// TAPHOU5E for Owlbear Rodeo — inside the sheet modal
//
// v2/js/core.js loads this only when a page is opened with ?embed=1, which
// the token popup does when it opens a character sheet in an Owlbear modal.
// The sheet's close button calls closeEmbed().
// ========================================

import { OBR, SHEET_MODAL } from './obr.js';

OBR.onReady(() => {
    window.closeEmbed = () => OBR.modal.close(SHEET_MODAL);
});
