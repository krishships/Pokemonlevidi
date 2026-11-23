/*
 * boottest.c — headless boot test for a Game Boy ROM.
 *
 * Links against binjgb's emulator core (no SDL, no window, no display) and
 * answers one question: does this ROM actually boot and render something?
 *
 * A ROM can assemble and link cleanly and still be broken — a bad text pointer,
 * a corrupted bank, an infinite loop in the title sequence. This catches that.
 *
 *   boottest <rom.gb> [frames]
 *
 * Exit codes: 0 rendered, 1 blank or crashed, 2 usage/IO error.
 *
 * Build (from a binjgb checkout):
 *   cc -O2 -std=gnu99 -Isrc boottest.c src/{memory,common,options,emulator,joypad}.c -lm
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "emulator.h"
#include "common.h"

static unsigned long fnv1a(const void* data, size_t size) {
  const unsigned char* p = (const unsigned char*)data;
  unsigned long h = 2166136261ul;
  for (size_t i = 0; i < size; i++) {
    h ^= p[i];
    h *= 16777619ul;
  }
  return h;
}

int main(int argc, char** argv) {
  if (argc < 2) {
    fprintf(stderr, "usage: %s <rom.gb> [frames]\n", argv[0]);
    return 2;
  }

  const char* path = argv[1];
  int frames = argc > 2 ? atoi(argv[2]) : 300;
  if (frames <= 0) frames = 300;

  FILE* f = fopen(path, "rb");
  if (!f) {
    fprintf(stderr, "boottest: cannot open %s\n", path);
    return 2;
  }
  fseek(f, 0, SEEK_END);
  long size = ftell(f);
  fseek(f, 0, SEEK_SET);
  if (size <= 0) {
    fprintf(stderr, "boottest: %s is empty\n", path);
    fclose(f);
    return 2;
  }

  u8* data = (u8*)malloc((size_t)size);
  if (!data || fread(data, 1, (size_t)size, f) != (size_t)size) {
    fprintf(stderr, "boottest: cannot read %s\n", path);
    fclose(f);
    free(data);
    return 2;
  }
  fclose(f);

  printf("rom: %s (%ld bytes)\n", path, size);

  EmulatorInit init;
  memset(&init, 0, sizeof(init));
  init.rom.data = data;
  init.rom.size = (size_t)size;
  init.audio_frequency = 44100;
  init.audio_frames = 2048;
  init.random_seed = 0;
  init.builtin_palette = 0;
  init.force_dmg = 0;
  init.cgb_color_curve = CGB_COLOR_CURVE_NONE;

  Emulator* em = emulator_new(&init);
  if (!em) {
    fprintf(stderr, "boottest: emulator failed to load the ROM\n");
    free(data);
    return 1;
  }
  /* binjgb takes ownership of the ROM buffer and frees it in emulator_delete */
  data = NULL;

  /* one frame == 70224 ticks (4.19 MHz / 59.7 Hz) */
  const Ticks TICKS_PER_FRAME = 70224;
  Ticks ticks = 0;              /* emulator_run_until takes an absolute target */
  for (int i = 0; i < frames; i++) {
    ticks += TICKS_PER_FRAME;
    EmulatorEvent ev = emulator_run_until(em, ticks);
    if (ev & EMULATOR_EVENT_INVALID_OPCODE) {
      fprintf(stderr, "boottest: invalid opcode at frame %d\n", i);
      emulator_delete(em);
      return 1;
    }
  }

  FrameBuffer* fb = emulator_get_frame_buffer(em);
  if (!fb) {
    fprintf(stderr, "boottest: no frame buffer\n");
    emulator_delete(em);
    return 1;
  }

  /* how many distinct colours are on screen? a blank or crashed screen is
     one; a rendered title screen is many. Count exact RGBA values. */
  static RGBA sorted[SCREEN_WIDTH * SCREEN_HEIGHT];
  const int NPIX = SCREEN_WIDTH * SCREEN_HEIGHT;
  memcpy(sorted, *fb, sizeof(RGBA) * NPIX);
  /* insertion-free unique count: sort then count transitions */
  for (int i = 1; i < NPIX; i++) {
    RGBA key = sorted[i];
    int j = i - 1;
    while (j >= 0 && sorted[j] > key) { sorted[j + 1] = sorted[j]; j--; }
    sorted[j + 1] = key;
  }
  int distinct = NPIX > 0 ? 1 : 0;
  for (int i = 1; i < NPIX; i++) {
    if (sorted[i] != sorted[i - 1]) distinct++;
  }
  printf("corner px: %08x  centre px: %08x\n",
         (unsigned)(*fb)[0], (unsigned)(*fb)[(SCREEN_HEIGHT / 2) * SCREEN_WIDTH + SCREEN_WIDTH / 2]);

  unsigned long hash = fnv1a(fb, sizeof(FrameBuffer));
  printf("frames: %d\n", frames);
  printf("distinct colours: %d\n", distinct);
  printf("frame hash: %08lx\n", hash & 0xfffffffful);

  emulator_delete(em);

  if (distinct < 3) {
    printf("RESULT: FAIL — screen looks blank (%d colours)\n", distinct);
    return 1;
  }
  printf("RESULT: PASS — ROM boots and renders\n");
  return 0;
}
