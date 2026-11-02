#!/bin/bash
set -euo pipefail
repo=$(cd -- "$(dirname -- "$0")/../.." && pwd)
kernel=$(realpath "${1:?请指定定制内核源码目录}")
output=$(realpath -m "${2:?请指定 KUnit 输出目录}")
mkdir -p "$output/build-temp"
export TMPDIR=$output/build-temp
cd "$kernel"
python tools/testing/kunit/kunit.py run --arch arm64 \
    --cross_compile aarch64-linux-gnu- --build_dir "$output" \
    --kunitconfig "$repo/arch/config/camss-buffer.kunitconfig" \
    --jobs "${JOBS:-8}" --timeout 60 'camss-*-buffer'
