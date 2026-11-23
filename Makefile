# Host-side build for the portable action-battle core.
# This does NOT build a ROM. The ROM is built by the pokeemerald tree
# (see docs/GRAFTING.md and tools/build_rom.sh).

CC      ?= cc
CFLAGS  ?= -std=c11 -O2 -Wall -Wextra -Werror -Iinclude
SRC      := src/action_battle.c src/generated/bosses_data.c
TEST_SRC := tests/test_action_battle.c
BIN      := build/ab_test

.PHONY: all test data check clean

all: test

test: $(BIN)
	./$(BIN)

$(BIN): $(SRC) $(TEST_SRC) include/action_battle.h include/generated/bosses.h
	@mkdir -p build
	$(CC) $(CFLAGS) $(SRC) $(TEST_SRC) -o $@

data:
	python3 tools/gen_bosses.py

check:
	python3 tools/validate_bosses.py
	python3 tools/gen_bosses.py --check

clean:
	rm -rf build
