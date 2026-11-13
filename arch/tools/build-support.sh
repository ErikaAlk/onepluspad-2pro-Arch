#!/bin/bash
set -euo pipefail
repo=$(cd -- "$(dirname -- "$0")/../.." && pwd)
output=$(realpath -m "${1:?请指定配套包输出目录}")
git -C "$repo" cat-file -e 25325453637b1f9f4c128d969269a5a132111f78^{commit}
mkdir -p "$output/downloads" "$output/packages" "$output/build-temp" "$output/pkgbuilds"
export TMPDIR=$output/build-temp
export SRCDEST=$output/downloads
export PKGDEST=$output/packages
git -C "$repo" archive --format=tar.gz --prefix=onepluspad-2pro-mainline-0.9.1/ \
    --output="$SRCDEST/erhai-arch-v0.9.1.tar.gz" 25325453637b1f9f4c128d969269a5a132111f78
cp -a "$repo/arch/pkgbuilds/erhai-upstream-support" "$output/pkgbuilds/"
cd "$output/pkgbuilds/erhai-upstream-support"
makepkg --nodeps --noconfirm --force
sha256sum "$PKGDEST/"*.pkg.tar.*
