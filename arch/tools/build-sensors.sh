#!/bin/bash
set -euo pipefail
repo=$(cd -- "$(dirname -- "$0")/../.." && pwd)
output=$(realpath -m "${1:?请指定传感器包输出目录}")
mkdir -p "$output/downloads" "$output/packages" "$output/pkgbuilds" "$output/build-temp"
export TMPDIR=$output/build-temp
export SRCDEST=$output/downloads
export PKGDEST=$output/packages
export ERHAI_WORKSPACE=${ERHAI_WORKSPACE:-$output/workspace}
python "$repo/tools/build-sensors.py" --output "$output/native-debs" \
    --work "${ERHAI_SENSORS_BUILD_WORK:-$output/native-work}" \
    --cache "${ERHAI_SENSORS_SOURCE_CACHE:-$output/downloads/sensors}" --jobs "${JOBS:-8}"
cp "$output/native-debs/erhai-sensors_0.4.0+b6762acb2_arm64.deb" "$SRCDEST/"
git -C "$repo" archive --format=tar.gz --prefix=onepluspad-2pro-mainline-0.6.0/ \
    --output="$SRCDEST/erhai-arch-v0.6.0.tar.gz" f9605bcc8f83d16293657cdca15b329e387baa53
cp -a "$repo/arch/pkgbuilds/erhai-sensors-runtime" "$output/pkgbuilds/"
cd "$output/pkgbuilds/erhai-sensors-runtime"
makepkg --config "$repo/arch/config/makepkg-aarch64.conf" --syncdeps --noconfirm --force
sha256sum "$PKGDEST/"*.pkg.tar.*
