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
cp "$output/native-debs/erhai-sensors_0.7.2+bdf36caaa_arm64.deb" "$SRCDEST/"
git -C "$repo" archive --format=tar.gz --prefix=onepluspad-2pro-mainline-0.9.1/ \
    --output="$SRCDEST/erhai-arch-v0.9.1.tar.gz" 25325453637b1f9f4c128d969269a5a132111f78
cp -a "$repo/arch/pkgbuilds/erhai-sensors-runtime" "$output/pkgbuilds/"
cd "$output/pkgbuilds/erhai-sensors-runtime"
makepkg --config "$repo/arch/config/makepkg-aarch64.conf" --nodeps --noconfirm --force
sha256sum "$PKGDEST/"*.pkg.tar.*
