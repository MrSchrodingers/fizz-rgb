#!/usr/bin/env bash
# Phase 1 end-to-end smoke test against the real K617.
# Requires: fizz/fizzd installed (run tools/install.sh first), daemon running.
set -euo pipefail

assert_ok() {
  if ! "$@"; then
    echo "FAIL: $*"
    exit 1
  fi
}

echo "==> Ensuring daemon is running..."
fizz daemon start || true
sleep 1

echo "==> 1. Status check"
assert_ok fizz status

echo "==> 2. Set solid red — visually confirm LEDs turn red"
fizz set red
read -rp "    LEDs red? [y/N] " ans
[[ "${ans,,}" == y* ]] || { echo "FAIL: user did not confirm red"; exit 1; }

echo "==> 3. Run rainbow effect — visually confirm rainbow animates"
fizz effect run fw-rainbow --speed 128
read -rp "    Rainbow animating? [y/N] " ans
[[ "${ans,,}" == y* ]] || { echo "FAIL: user did not confirm rainbow"; exit 1; }

echo "==> 4. Run waterfall — visually confirm"
fizz effect run fw-waterfall --color "#00aaff" --speed 100
read -rp "    Waterfall animating? [y/N] " ans
[[ "${ans,,}" == y* ]] || { echo "FAIL: user did not confirm waterfall"; exit 1; }

echo "==> 5. Save profile, switch effect, restore profile"
fizz profile save smoke --effect fw-snake --color "#ff00ff" --speed 80
fizz effect run fw-static --color "#ffffff"
sleep 1
fizz profile activate smoke
read -rp "    Snake (magenta)? [y/N] " ans
[[ "${ans,,}" == y* ]] || { echo "FAIL: user did not confirm profile restored"; exit 1; }
fizz profile delete smoke

echo "==> 6. Restart daemon, confirm effect persists across restart"
fizz profile save persist --effect fw-rainbow-blossom --speed 100
fizz profile activate persist
fizz daemon restart
sleep 2
fizz status
read -rp "    Rainbow Blossom after restart? [y/N] " ans
[[ "${ans,,}" == y* ]] || { echo "FAIL: profile did not restore on restart"; exit 1; }
fizz profile delete persist

echo
echo "SMOKE TESTS PASSED."
