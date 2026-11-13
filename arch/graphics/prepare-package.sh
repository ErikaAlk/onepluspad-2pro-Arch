#!/bin/bash
set -euo pipefail
stage=$(realpath "$1")
repo=$(realpath "$2")
output=$(realpath -m "$3")
mkdir -p "$output/archive-input/metadata/mesa" "$output/archive-input/metadata/iris"
cp -a "$stage/host-install" "$stage/iris-install" "$output/archive-input/"
cp "$repo/packaging/mesa/shared/mesa/source.json" "$repo/packaging/mesa/shared/mesa/"*.patch "$output/archive-input/metadata/mesa/"
cp "$repo/packaging/iris-vaapi/source.json" "$repo/packaging/iris-vaapi/"*.patch "$repo/packaging/iris-vaapi/COPYING.MIT" "$repo/packaging/iris-vaapi/COPYING.LGPL" "$output/archive-input/metadata/iris/"
cp "$stage/src/mesa-26.2.6/docs/license.rst" "$output/archive-input/metadata/mesa/"
tar --sort=name --mtime=@0 --owner=0 --group=0 --numeric-owner -C "$output/archive-input" -I 'zstd -19 -T1' -cf "$output/erhai-graphics-26.2.6-1.3-aarch64.tar.zst" host-install iris-install metadata
tar --sort=name --mtime=@0 --owner=0 --group=0 --numeric-owner -C "$stage/android-install" -I 'zstd -19 -T1' -cf "$output/erhai-android-mesa-26.2.6-overlay.tar.zst" vendor
sha256sum "$output/"*.tar.zst > "$output/SHA256SUMS"
