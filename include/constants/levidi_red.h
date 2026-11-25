#ifndef GUARD_CONSTANTS_LEVIDI_RED_H
#define GUARD_CONSTANTS_LEVIDI_RED_H

// ---------------------------------------------------------------------------
// Pokemonlevidi -- "Red" story layer (May's search).
//
// Every ID below is an ALIAS of a vanilla flag/var slot that is defined in
// include/constants/flags.h / vars.h but referenced nowhere in this repo.
// No new flag or var numbers are created, so save-block layout is untouched.
//
//   flags : 0x020 - 0x02A   (FLAG_UNUSED_0x020 ... FLAG_UNUSED_0x02A)
//   vars  : 0x40F7 - 0x40F8 (VAR_UNUSED_0x40F7, VAR_UNUSED_0x40F8)
//
// The slots 0x020-0x04F are ordinary save-block flags (not FLAG_TEMP_*, which
// are cleared on every map load), so they persist across saves and map loads.
// ---------------------------------------------------------------------------

// --- story flags -----------------------------------------------------------
#define FLAG_LEVIDI_RED_OPENING             FLAG_UNUSED_0x020 // bedroom scene played
#define FLAG_LEVIDI_RED_TRAVELLER_DONE      FLAG_UNUSED_0x021 // Oldale scene played
#define FLAG_LEVIDI_RED_TRACE_DONE          FLAG_UNUSED_0x022 // Route 102 trace played
#define FLAG_LEVIDI_RED_GARDENER_DONE       FLAG_UNUSED_0x023 // Petalburg scene played
#define FLAG_LEVIDI_RED_REUNION_DONE        FLAG_UNUSED_0x024 // reunion played
#define FLAG_LEVIDI_HAS_CAP                 FLAG_UNUSED_0x025 // she is carrying his cap
#define FLAG_LEVIDI_RED_AT_HOME             FLAG_UNUSED_0x026 // choice A taken: he came home
#define FLAG_LEVIDI_RED_HOME_GREETED        FLAG_UNUSED_0x027 // talked to him at home once

// --- object hide flags (set = object hidden, the vanilla convention) -------
#define FLAG_HIDE_LEVIDI_OLDALE_TRAVELLER   FLAG_UNUSED_0x028
#define FLAG_HIDE_LEVIDI_RED_WOODS          FLAG_UNUSED_0x029
#define FLAG_HIDE_LEVIDI_RED_HOME           FLAG_UNUSED_0x02A

// --- vars ------------------------------------------------------------------
#define VAR_LEVIDI_RED_PROGRESS             VAR_UNUSED_0x40F7
//   0 = nothing yet          1 = bedroom, she decides to go
//   2 = traveller (Oldale)   3 = the cap (Route 102)
//   4 = gardener (Petalburg) 5 = reunion played
#define VAR_LEVIDI_RED_CHOICE               VAR_UNUSED_0x40F8
//   0 = no choice yet        1 = he came home      2 = she stayed

#endif // GUARD_CONSTANTS_LEVIDI_RED_H
