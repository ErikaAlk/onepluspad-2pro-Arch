#!/bin/bash
set -euo pipefail
repo=$(cd -- "$(dirname -- "$0")/../.." && pwd)
native=$(realpath "${1:?请指定源码构建的 NPU 产物目录}")
output=$(realpath -m "${2:?请指定 Arch 软件包输出目录}")
mkdir -p "$output/pkgbuilds" "$output/packages" "$output/build-temp"
export TMPDIR=$output/build-temp SRCDEST=$native PKGDEST=$output/packages
cp -a "$repo/arch/pkgbuilds/erhai-npu" "$output/pkgbuilds/"
cd "$output/pkgbuilds/erhai-npu"
makepkg --config "$repo/arch/config/makepkg-aarch64.conf" --nodeps --force
sha256sum "$PKGDEST/"*.pkg.tar.*
