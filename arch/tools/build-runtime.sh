#!/bin/bash
set -euo pipefail
repo=$(cd -- "$(dirname -- "$0")/../.." && pwd)
output=$(realpath -m "${1:?请指定运行组件输出目录}")
mkdir -p "$output/downloads" "$output/packages" "$output/build-temp" "$output/pkgbuilds"
export TMPDIR=$output/build-temp SRCDEST=$output/downloads PKGDEST=$output/packages
git -C "$repo" archive --format=tar.gz --prefix=onepluspad-2pro-mainline-0.12.2/ \
  --output="$SRCDEST/erhai-arch-v0.12.2.tar.gz" 7b862f9066dbc53f8646e7513188c7adb4400280
git -C "$repo" archive --format=tar.gz --prefix=arch-release-notifier/ \
  --output="$SRCDEST/arch-release-notifier.tar.gz" 25325453637b1f9f4c128d969269a5a132111f78 \
  packaging/release-notifier packaging/erhai-release-notifier/copyright
cp -a "$repo/arch/pkgbuilds/erhai-upstream-runtime" "$output/pkgbuilds/"
cp "$repo/switch/erhai-switch" "$repo/switch/switch-common.sh" "$SRCDEST/"
cd "$output/pkgbuilds/erhai-upstream-runtime"
makepkg --nodeps --force
sha256sum "$PKGDEST/"*.pkg.tar.*
