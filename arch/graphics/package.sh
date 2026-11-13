#!/bin/bash
set -euo pipefail
entry=$(cd -- "$(dirname -- "$0")" && pwd)
archives=$(realpath "$1")
output=$(realpath -m "$2")
mkdir -p "$output/mesa" "$output/iris" "$output/temp"
export TMPDIR="$output/temp"
for package in mesa iris; do
  cp "$entry/$package/PKGBUILD" "$output/$package/PKGBUILD"
  cp "$archives/erhai-graphics-26.2.6-1.3-aarch64.tar.zst" "$output/$package/"
  cd "$output/$package"
  SOURCE_DATE_EPOCH=0 makepkg --config "$entry/makepkg-aarch64.conf" --nodeps --cleanbuild --force
done
find "$output" -maxdepth 2 -type f -name '*.pkg.tar.zst' -exec sha256sum {} + > "$output/SHA256SUMS"
