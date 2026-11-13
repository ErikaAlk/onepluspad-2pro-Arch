#!/bin/bash
set -euo pipefail
repo=$(cd -- "$(dirname -- "$0")/../.." && pwd)
python "$repo/arch/tools/kernel-source.py" build "${1:?请指定内核源码目录}" "${2:?请指定输出目录}" --jobs "${JOBS:-8}"
