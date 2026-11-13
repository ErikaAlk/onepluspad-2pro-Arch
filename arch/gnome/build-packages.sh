#!/bin/bash
set -euo pipefail
if [ "$#" -ne 3 ]; then
  echo '用法：build-packages.sh 原包缓存目录 六件修复归档 输出目录' >&2
  exit 2
fi
cache=$(realpath "$1")
payload=$(realpath "$2")
output=$(realpath -m "$3")
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
mkdir -p "$output/packages" "$output/work" "$output/temp"
export TMPDIR="$output/temp"
export CARCH=aarch64
export PKGDEST="$output/packages"
for component in mutter gnome-settings-daemon gnome-control-center; do
  build="$output/work/$component"
  mkdir -p "$build"
  cp "$script_dir/pkgbuilds/$component/PKGBUILD" "$build/PKGBUILD"
  cp "$cache/$component-51.1-1-aarch64.pkg.tar.xz" "$build/"
  cp "$payload" "$build/gnome-51.1-power-fixes-aarch64.tar.xz"
  cd "$build"
  makepkg --nodeps --force --noconfirm
done
sha256sum "$output/packages/"*.pkg.tar.*
