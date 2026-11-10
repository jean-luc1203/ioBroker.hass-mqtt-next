#!/usr/bin/env bash
set -euo pipefail
# Reproduce the EXACT 2019 repository audited for this modernization study.
# Run on a Linux machine with GitHub access. No changes to the user's production ioBroker.
TARGET="${1:-./upstream-2019-reference}"
if [ -e "$TARGET" ]; then echo "Refusing to overwrite: $TARGET" >&2; exit 1; fi
git clone https://github.com/smarthomefans/ioBroker.hass-mqtt.git "$TARGET"
git -C "$TARGET" checkout --detach 72a85bd23d707730a67704c0bc1653ff6f114d5a
printf 'Audited upstream commit: '
git -C "$TARGET" rev-parse HEAD
