#!/bin/bash
set -euo pipefail
repo=$(cd -- "$(dirname -- "$0")/../.." && pwd)
output=$(realpath -m "${1:?请指定配套包输出目录}")
git -C "$repo" cat-file -e f9605bcc8f83d16293657cdca15b329e387baa53^{commit}
mkdir -p "$output/downloads" "$output/packages" "$output/build-temp" "$output/pkgbuilds"
export TMPDIR=$output/build-temp
export SRCDEST=$output/downloads
export PKGDEST=$output/packages
git -C "$repo" archive --format=tar.gz --prefix=onepluspad-2pro-mainline-0.6.0/ \
    --output="$SRCDEST/erhai-arch-v0.6.0.tar.gz" f9605bcc8f83d16293657cdca15b329e387baa53
cp -a "$repo/arch/pkgbuilds/erhai-upstream-support" "$output/pkgbuilds/"
cd "$output/pkgbuilds/erhai-upstream-support"
makepkg --syncdeps --noconfirm --force
sha256sum "$PKGDEST/"*.pkg.tar.*
