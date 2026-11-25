@ ===========================================================================
@ Pokemonlevidi -- "Red" story layer: May's search.
@
@ NEW FILE. Nothing in here renames, replaces or re-orders a vanilla script
@ label. Every symbol is prefixed LevidiRed_ (or is a map-script table that
@ the repo did not previously have).
@
@ Text lives in data/text/levidi_red.inc.
@ Flag / var aliases live in include/constants/levidi_red.h.
@
@ VAR_LEVIDI_RED_PROGRESS
@   0  nothing yet (bedroom scene has not played)
@   1  bedroom: she decides to go
@   2  OLDALE: the traveller says west, to the woods
@   3  ROUTE 102: she finds his cap
@   4  PETALBURG: the gardener points at the woods
@   5  reunion played (VAR_LEVIDI_RED_CHOICE holds the branch)
@
@ Every scene sets its progress value and its "done" flag as its FIRST two
@ actions, so a scene can never re-fire and an interrupted scene can never
@ trap the player in a repeating text box.
@ ===========================================================================


@ ---------------------------------------------------------------------------
@ 1. OPENING -- her bedroom, the moment the clock is set.
@    Hook: data/maps/LittlerootTown_MaysHouse_2F/scripts.inc
@          map_script MAP_SCRIPT_ON_FRAME_TABLE, LevidiRed_OnFrame_MaysHouse2F
@    Gate: VAR_LEVIDI_RED_PROGRESS == 0 AND VAR_LITTLEROOT_INTRO_STATE >= 6
@          (6 = "Set clock"; before that the room is mid-tutorial and the
@          stairs are blocked, so we stay out of vanilla's way).
@ ---------------------------------------------------------------------------
LevidiRed_OnFrame_MaysHouse2F:
	map_script_2 VAR_LEVIDI_RED_PROGRESS, 0, LevidiRed_Scene_Opening
	.2byte 0

LevidiRed_Scene_Opening::
	goto_if_set FLAG_LEVIDI_RED_OPENING, LevidiRed_Scene_Opening_End
	goto_if_lt VAR_LITTLEROOT_INTRO_STATE, 6, LevidiRed_Scene_Opening_End
	checkplayergender
	goto_if_eq VAR_RESULT, MALE, LevidiRed_Scene_Opening_Male
	setflag FLAG_LEVIDI_RED_OPENING
	setvar VAR_LEVIDI_RED_PROGRESS, 1
	lockall
	msgbox LevidiRed_Text_Opening1, MSGBOX_DEFAULT
	msgbox LevidiRed_Text_Opening2, MSGBOX_DEFAULT
	msgbox LevidiRed_Text_Opening3, MSGBOX_DEFAULT
	msgbox LevidiRed_Text_Opening4, MSGBOX_DEFAULT
	closemessage
	releaseall
	end

@ The story is written for MAY. If the player picked the boy, the layer
@ stays silent rather than talking at the wrong person. The flag is still
@ set so the frame-table entry can never spin.
LevidiRed_Scene_Opening_Male::
	setflag FLAG_LEVIDI_RED_OPENING
	end

LevidiRed_Scene_Opening_End::
	end


@ ---------------------------------------------------------------------------
@ 2. OLDALE TOWN -- the traveller who saw him.
@    Hook: object script on a NEW object_event appended to
@          data/maps/OldaleTown/map.json at (10, 17), elev 3, walkable.
@    Gate: VAR_LEVIDI_RED_PROGRESS == 1. Once told, her hide flag is set and
@          the object is removed from the current map immediately.
@ ---------------------------------------------------------------------------
LevidiRed_EventScript_Traveller::
	goto_if_set FLAG_LEVIDI_RED_TRAVELLER_DONE, LevidiRed_EventScript_Traveller_Again
	goto_if_ne VAR_LEVIDI_RED_PROGRESS, 1, LevidiRed_EventScript_Traveller_Early
	setflag FLAG_LEVIDI_RED_TRAVELLER_DONE
	setvar VAR_LEVIDI_RED_PROGRESS, 2
	setflag FLAG_HIDE_LEVIDI_OLDALE_TRAVELLER
	lock
	faceplayer
	msgbox LevidiRed_Text_Traveller1, MSGBOX_DEFAULT
	msgbox LevidiRed_Text_Traveller2, MSGBOX_DEFAULT
	msgbox LevidiRed_Text_Traveller3, MSGBOX_DEFAULT
	msgbox LevidiRed_Text_Traveller4, MSGBOX_DEFAULT
	closemessage
	removeobject LOCALID_LEVIDI_OLDALE_TRAVELLER
	release
	end

LevidiRed_EventScript_Traveller_Early::
	lock
	faceplayer
	msgbox LevidiRed_Text_TravellerEarly, MSGBOX_DEFAULT
	closemessage
	release
	end

LevidiRed_EventScript_Traveller_Again::
	lock
	faceplayer
	msgbox LevidiRed_Text_TravellerAgain, MSGBOX_DEFAULT
	closemessage
	release
	end


@ ---------------------------------------------------------------------------
@ 3. ROUTE 102 -- the trace: his cap on the fence post.
@    Hook: data/maps/Route102/scripts.inc (map had no map scripts at all)
@          map_script MAP_SCRIPT_ON_FRAME_TABLE, LevidiRed_OnFrame_Route102
@    Gate: VAR_LEVIDI_RED_PROGRESS is 1 or 2 -- so a player who walks past the
@          Oldale traveller without talking to her still finds the cap and the
@          chain cannot stall. No NPC, no movement, no waits.
@ ---------------------------------------------------------------------------
LevidiRed_OnFrame_Route102:
	map_script_2 VAR_LEVIDI_RED_PROGRESS, 1, LevidiRed_Scene_Trace
	map_script_2 VAR_LEVIDI_RED_PROGRESS, 2, LevidiRed_Scene_Trace
	.2byte 0

LevidiRed_Scene_Trace::
	goto_if_set FLAG_LEVIDI_RED_TRACE_DONE, LevidiRed_Scene_Trace_End
	goto_if_ge VAR_LEVIDI_RED_PROGRESS, 3, LevidiRed_Scene_Trace_End
	setflag FLAG_LEVIDI_RED_TRACE_DONE
	setvar VAR_LEVIDI_RED_PROGRESS, 3
	setflag FLAG_LEVIDI_HAS_CAP
	lockall
	msgbox LevidiRed_Text_Trace1, MSGBOX_DEFAULT
	msgbox LevidiRed_Text_Trace2, MSGBOX_DEFAULT
	closemessage
	releaseall
	end

LevidiRed_Scene_Trace_End::
	end


@ ---------------------------------------------------------------------------
@ 4. PETALBURG CITY -- the gardener who gave him tea.
@    Hook: object script on a NEW object_event appended to
@          data/maps/PetalburgCity/map.json at (13, 22), elev 3, walkable.
@    Gate: VAR_LEVIDI_RED_PROGRESS == 3.
@ ---------------------------------------------------------------------------
LevidiRed_EventScript_Gardener::
	goto_if_set FLAG_LEVIDI_RED_GARDENER_DONE, LevidiRed_EventScript_Gardener_Again
	goto_if_ne VAR_LEVIDI_RED_PROGRESS, 3, LevidiRed_EventScript_Gardener_Early
	setflag FLAG_LEVIDI_RED_GARDENER_DONE
	setvar VAR_LEVIDI_RED_PROGRESS, 4
	lock
	faceplayer
	msgbox LevidiRed_Text_Gardener1, MSGBOX_DEFAULT
	msgbox LevidiRed_Text_Gardener2, MSGBOX_DEFAULT
	msgbox LevidiRed_Text_Gardener3, MSGBOX_DEFAULT
	msgbox LevidiRed_Text_Gardener4, MSGBOX_DEFAULT
	closemessage
	release
	end

LevidiRed_EventScript_Gardener_Early::
	lock
	faceplayer
	msgbox LevidiRed_Text_GardenerEarly, MSGBOX_DEFAULT
	closemessage
	release
	end

LevidiRed_EventScript_Gardener_Again::
	lock
	faceplayer
	msgbox LevidiRed_Text_GardenerAgain, MSGBOX_DEFAULT
	closemessage
	release
	end


@ ---------------------------------------------------------------------------
@ 5. PETALBURG WOODS -- he is here, and only here once progress reaches 4.
@    Hook A: data/maps/PetalburgWoods/scripts.inc (map had no map scripts)
@            map_script MAP_SCRIPT_ON_TRANSITION, LevidiRed_OnTransition_PetalburgWoods
@            ON_TRANSITION runs before objects are created, which is why the
@            hide flag works here (ON_FRAME_TABLE would be too late).
@    Hook B: object script on a NEW object_event appended to
@            data/maps/PetalburgWoods/map.json at (10, 18), elev 3, walkable.
@    Gate:  progress >= 4 to be visible; progress == 4 to start the reunion.
@ ---------------------------------------------------------------------------
LevidiRed_OnTransition_PetalburgWoods::
	goto_if_ge VAR_LEVIDI_RED_PROGRESS, 4, LevidiRed_OnTransition_PetalburgWoods_Show
	setflag FLAG_HIDE_LEVIDI_RED_WOODS
	end

LevidiRed_OnTransition_PetalburgWoods_Show::
	clearflag FLAG_HIDE_LEVIDI_RED_WOODS
	end

LevidiRed_EventScript_RedWoods::
	goto_if_ge VAR_LEVIDI_RED_PROGRESS, 5, LevidiRed_EventScript_RedWoods_After
	goto_if_ne VAR_LEVIDI_RED_PROGRESS, 4, LevidiRed_EventScript_RedWoods_Quiet
	setflag FLAG_LEVIDI_RED_REUNION_DONE
	setvar VAR_LEVIDI_RED_PROGRESS, 5
	lockall
	faceplayer
	msgbox LevidiRed_Text_Reunion1, MSGBOX_DEFAULT
	msgbox LevidiRed_Text_Reunion2, MSGBOX_DEFAULT
	msgbox LevidiRed_Text_Reunion3, MSGBOX_DEFAULT
	msgbox LevidiRed_Text_Reunion4, MSGBOX_DEFAULT
	goto_if_unset FLAG_LEVIDI_HAS_CAP, LevidiRed_Scene_Reunion_Ask
	msgbox LevidiRed_Text_ReunionCap, MSGBOX_DEFAULT
LevidiRed_Scene_Reunion_Ask::
	msgbox LevidiRed_Text_ReunionAsk, MSGBOX_DEFAULT
	msgbox LevidiRed_Text_ReunionQuestion, MSGBOX_YESNO
	goto_if_eq VAR_RESULT, NO, LevidiRed_Scene_Reunion_Stay
@ --- branch A: he comes home -------------------------------------------------
	setvar VAR_LEVIDI_RED_CHOICE, 1
	setflag FLAG_LEVIDI_RED_AT_HOME
	setflag FLAG_HIDE_LEVIDI_RED_WOODS
	msgbox LevidiRed_Text_ReunionYes1, MSGBOX_DEFAULT
	msgbox LevidiRed_Text_ReunionYes2, MSGBOX_DEFAULT
	closemessage
	removeobject LOCALID_LEVIDI_RED_WOODS
	releaseall
	end

@ --- branch B: she stays -----------------------------------------------------
LevidiRed_Scene_Reunion_Stay::
	setvar VAR_LEVIDI_RED_CHOICE, 2
	msgbox LevidiRed_Text_ReunionNo1, MSGBOX_DEFAULT
	msgbox LevidiRed_Text_ReunionNo2, MSGBOX_DEFAULT
	closemessage
	releaseall
	end

@ Talking to him again after branch B. He is still in the woods; she visits.
LevidiRed_EventScript_RedWoods_After::
	goto_if_eq VAR_LEVIDI_RED_CHOICE, 1, LevidiRed_EventScript_RedWoods_Quiet
	lock
	faceplayer
	msgbox LevidiRed_Text_WoodsLater, MSGBOX_DEFAULT
	closemessage
	release
	end

LevidiRed_EventScript_RedWoods_Quiet::
	lock
	faceplayer
	msgbox LevidiRed_Text_RedWoodsQuiet, MSGBOX_DEFAULT
	closemessage
	release
	end


@ ---------------------------------------------------------------------------
@ 6. LITTLEROOT TOWN -- branch A payoff. He is standing outside her house.
@    Hook: data/maps/LittlerootTown/scripts.inc
@          The map already has an ON_TRANSITION and MapHeaderGetScriptTable
@          returns the FIRST match, so the new entry is placed first and
@          tail-calls the vanilla one with "goto" (vanilla ends with "end",
@          so a tail call, not a "call", is what keeps its behaviour intact).
@    Gate: FLAG_LEVIDI_RED_AT_HOME. Otherwise the object stays hidden.
@ ---------------------------------------------------------------------------
LevidiRed_OnTransition_LittlerootTown::
	goto_if_set FLAG_LEVIDI_RED_AT_HOME, LevidiRed_OnTransition_LittlerootTown_Show
	setflag FLAG_HIDE_LEVIDI_RED_HOME
	goto LittlerootTown_OnTransition

LevidiRed_OnTransition_LittlerootTown_Show::
	clearflag FLAG_HIDE_LEVIDI_RED_HOME
	goto LittlerootTown_OnTransition

LevidiRed_EventScript_RedHome::
	goto_if_set FLAG_LEVIDI_RED_HOME_GREETED, LevidiRed_EventScript_RedHome_Again
	setflag FLAG_LEVIDI_RED_HOME_GREETED
	lock
	faceplayer
	msgbox LevidiRed_Text_Home1, MSGBOX_DEFAULT
	msgbox LevidiRed_Text_Home2, MSGBOX_DEFAULT
	closemessage
	release
	end

LevidiRed_EventScript_RedHome_Again::
	lock
	faceplayer
	msgbox LevidiRed_Text_HomeRepeat, MSGBOX_DEFAULT
	closemessage
	release
	end
