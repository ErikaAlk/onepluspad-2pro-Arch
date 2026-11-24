#!/bin/bash
set -euo pipefail
repo=$(cd -- "$(dirname -- "$0")/../.." && pwd)
output=$(realpath -m "${1:?请指定配套包输出目录}")
upstream=7b862f9066dbc53f8646e7513188c7adb4400280
mkdir -p "$output/downloads" "$output/packages" "$output/build-temp" "$output/pkgbuilds"
export TMPDIR=$output/build-temp
export SRCDEST=$output/downloads
export PKGDEST=$output/packages
git -C "$repo" archive --format=tar.gz --prefix=onepluspad-2pro-mainline-0.12.2/ \
    --output="$SRCDEST/erhai-arch-v0.12.2.tar.gz" "$upstream"
cp -a "$repo/arch/pkgbuilds/erhai-upstream-support" "$output/pkgbuilds/"
cd "$output/pkgbuilds/erhai-upstream-support"
makepkg --nodeps --noconfirm --force
sha256sum "$PKGDEST/"*.pkg.tar.*
