# Real-time action boss mode — injection points in pokehns-expansion
Repo: github.com/PokemonHnS-Development/pokehns-expansion @ 167aa6d (2026-09-16).
Read-only inspection; no build performed. All line numbers are from this commit.

## 1. Trainer / boss definitions
- Roster + parties (Showdown-syntax `.party`, converted at build time by tools/trainerproc):
  src/data/trainers_hns.party (16,004 lines, 653 HnS trainers),
  src/data/trainers.party (Emerald base), src/data/trainers_frlg.party,
  src/data/battle_partners.party, src/data/debug_trainers.party.
  Rule: trainer_rules.mk (%.h: %.party, CPP + $(TRAINERPROC)).
- IDs: include/constants/opponents_hns.h (TRAINER_*_HNS 1..652, TRAINERS_COUNT_HNS 653,
  MAX_TRAINERS_COUNT_HNS 864), aggregated in include/constants/opponents.h
  (TRAINERS_COUNT / MAX_TRAINERS_COUNT selected by IS_FRLG / IS_HNS).
- Runtime table: src/data.c:232 `const struct Trainer gTrainers[DIFFICULTY_COUNT][TRAINERS_COUNT]`
  (3 difficulty tiers, include/constants/difficulty.h); parties filled by
  CreateNPCTrainerParty (src/battle_main.c:2179) / CreateNPCTrainerPartyFromTrainer (src/battle_main.c:2004).
- Trainer art: Pic: field -> enum TrainerPicID (include/constants/trainers.h) -> gTrainerSprites[]
  (include/data.h:205, struct TrainerSprite with frontPic/palette/mugshotCoords).

## 2. Battle start and battle loop
- Overworld -> battle: script macro `trainerbattle` (asm/macros/event.inc:812) ->
  ScrCmd_trainerbattle (src/scrcmd.c:3286) -> BattleSetup_ConfigureTrainerBattle (src/battle_setup.c:1396)
  -> data/scripts/trainer_battle.inc -> ScrCmd_dotrainerbattle (src/scrcmd.c:3295)
  -> BattleSetup_StartTrainerBattle (src/battle_setup.c:1581) -> DoTrainerBattle (src/battle_setup.c:529)
  -> CreateBattleStartTask (src/battle_setup.c:319) -> Task_BattleStart (src/battle_setup.c:291)
  -> SetMainCallback2(CB2_InitBattle).
- Trainer spotting: CheckForTrainersWantingBattle (src/trainer_see.c:435), called from
  src/field_control_avatar.c:189.
- Per-frame: main loop in src/main.c (~187-199) calls gMain.callback1 then gMain.callback2.
  In battle: gMain.callback1 = BattleMainCB1 (src/battle_main.c:3160, set at 1140/1401/1853),
  gMain.callback2 = BattleMainCB2 (src/battle_main.c:1864).
  BattleMainCB1 runs gBattleMainFunc (src/battle_main.c:252) + each gBattlerControllerFuncs[].
- Turn loop: gBattleMainFunc chain —
  TryDoEventsBeforeFirstTurn (3999) -> HandleTurnActionSelectionState (4354)
  -> SetActionsAndBattlersTurnOrder (5186) -> RunTurnActionsFunctions (5563)
  -> BattleTurnPassed (4166) -> HandleTurnActionSelectionState (4230).
  Action dispatch: sTurnActionsFuncsTable (src/battle_main.c:486); B_ACTION_* in include/battle.h:39.
- Input for player action: PlayerHandleChooseAction (src/battle_controller_player.c:60).

## 3. Sprites / front pics / animation
- Mon pics per species: SpeciesInfo.frontPic/backPic/palette (include/pokemon.h:443-452),
  data in src/data/graphics/pokemon.h (anim_front 64x128 PNG = 2 frames; back 64x64 = 1 frame).
- Battle battler sprites: gBattlerSpriteTemplates (src/pokemon.c:2952), 64x64 affine OAM
  (gOamData_BattleSpriteOpponentSide / PlayerSide, src/battle_main.c:~275-300),
  loaded by BattleLoadMonSpriteGfx (src/battle_gfx_sfx_util.c:669).
- Positions: sBattlerCoords[BATTLE_COORDS_COUNT][MAX_BATTLERS_COUNT] (src/battle_anim_mons.c:37);
  enum in include/battle_interface.h:9 (SINGLES, DOUBLES — a third "SIDE" entry is additive).
- Animated-sprite system: YES. src/pokemon_animation.c + include/pokemon_animation.h —
  LaunchAnimationTaskForFrontSprite(sprite, enum AnimFunctionIDs) (:535),
  LaunchAnimationTaskForBackSprite (:550), ~150 canned anims (bounce, lunge, spin, flip, glow...).
  Idle 2-frame anim table: gAnims_MonPic (src/data.c:218, MAX_MON_PIC_FRAMES 2,
  include/constants/pokemon.h:385).
- Overworld mon sprites: object_event_pic_tables_followers.h, OW_POKEMON_OBJECT_EVENTS +
  OW_FOLLOWERS_ENABLED TRUE (include/config/overworld.h:51,62).

## 4. Five injection points (least intrusive first)
1. Task_BattleStart / CreateBattleStartTask — src/battle_setup.c:291 / :319.
   Branch on a flag/var to call a new CB2_InitActionBoss instead of CB2_InitBattle. One `if`, no engine change.
2. A standalone mode file modelled on src/pokemon_jump.c (CB2_PokemonJump :543, task state machine
   GameRound_Leader :893). Never touches battle_main.c; return via gMain.savedCallback.
3. Custom battler controller cloned from src/battle_controller_safari.c (sSafariBufferCommands table,
   SafariHandleChooseAction) + new B_ACTION_* in include/battle.h:39 + sTurnActionsFuncsTable
   (src/battle_main.c:486). Additive, precedented by BATTLE_TYPE_SAFARI.
4. Replace the turn loop: assign gBattleMainFunc (src/battle_main.c:252) to a real-time update
   instead of HandleTurnActionSelectionState at src/battle_main.c:4120/4230. Highest leverage,
   highest risk (all end-turn/outcome handling must still run).
5. Rendering/arena layer: add a BATTLE_COORDS_* entry (src/battle_anim_mons.c:37,
   include/battle_interface.h:9) and drive gBattlerSpriteTemplates (src/pokemon.c:2952) with
   LaunchAnimationTaskForFrontSprite; custom background via BattleSetup_GetEnvironmentId
   (src/battle_setup.c:958) and BattleTransition_StartOnField (src/battle_transition.c:1010).

## 5. Existing real-time / non-turn-based code to reuse
- src/pokemon_jump.c — real-time minigame: frame-driven state machine, mon sprites, vine timing,
  physics (UpdateJump), hit reactions (SpriteCB_MonHitShake/Flash). Best scaffold.
- src/berry_crush.c (UpdateGame), src/berry_blender.c — real-time timing minigames.
- src/minigame_countdown.c — reusable 3-2-1 countdown.
- Safari battles: BATTLE_TYPE_SAFARI (include/constants/battle.h:86) + src/battle_controller_safari.c
  — custom action set inside the real battle engine.
- Contest: src/contest.c Task_DoAppeals (:70) — timed appeal with decaying applause meter.
- Battle Pike / Pyramid (src/battle_pike.c, src/battle_pyramid.c) are menu-driven, not real-time.
- No existing real-time boss/action battle exists in the repo (grep for "real time"/"boss": only RTC and
  trainer classes). BATTLE_TYPE_RAID (1<<12) is declared but effectively unimplemented.
