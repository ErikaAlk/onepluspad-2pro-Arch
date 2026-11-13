#!/bin/bash
set -euo pipefail
repo=$(cd -- "$(dirname -- "$0")/../.." && pwd)
cache=$(realpath "${1:?请指定已按 packaging/gunyahvm/source.json 校验的下载目录}")
output=$(realpath -m "${2:?请指定 Arch 包输出目录}")
mkdir -p "$output/pkgbuilds" "$output/packages" "$output/build-temp"
export TMPDIR=$output/build-temp SRCDEST=$cache PKGDEST=$output/packages
cp -a "$repo/arch/pkgbuilds/gunyahvm" "$output/pkgbuilds/"
cd "$output/pkgbuilds/gunyahvm"
makepkg --config "$repo/arch/config/makepkg-aarch64.conf" --nodeps --force
sha256sum "$PKGDEST/"*.pkg.tar.*
