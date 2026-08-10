#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
cat src/00-head.html \
    src/10-core.js \
    src/20-world.js \
    src/30-entities.js \
    src/40-powers.js \
    src/50-math.js \
    src/70-render.js \
    src/80-loop.js \
    src/99-tail.html > jay-squared.html
echo "built jay-squared.html  ($(wc -c < jay-squared.html) bytes)"
