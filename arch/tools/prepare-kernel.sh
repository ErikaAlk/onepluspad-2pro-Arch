#!/bin/bash
set -euo pipefail
repo=$(cd -- "$(dirname -- "$0")/../.." && pwd)
python "$repo/arch/tools/kernel-source.py" prepare "${1:?请指定全新的内核源码目录}"
