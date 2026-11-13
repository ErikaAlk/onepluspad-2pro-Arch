#!/bin/bash
set -euo pipefail
if [ "$#" -ne 2 ]; then
  echo '用法：verify-runtime.sh ARM64根目录 六件产物目录' >&2
  exit 2
fi
sysroot=$(realpath "$1")
payload=$(realpath "$2")
libraries="$sysroot/usr/lib:$sysroot/usr/lib/gnome-settings-daemon-51:$sysroot/usr/lib/pulseaudio:$sysroot/usr/lib/mutter-51"
for relative in usr/lib/gsd-media-keys usr/lib/gsd-power usr/bin/gnome-control-center usr/lib/libmutter-51.so.0.0.0; do
  readelf -h "$payload/$relative"
  qemu-aarch64-static -L "$sysroot" "$sysroot/usr/lib/ld-linux-aarch64.so.1" --library-path "$libraries" --list "$payload/$relative"
done
for binary in gsd-media-keys gsd-power; do
  qemu-aarch64-static -L "$sysroot" -E LD_LIBRARY_PATH="$libraries" -E LD_BIND_NOW=1 "$payload/usr/lib/$binary" --help
done
qemu-aarch64-static -L "$sysroot" -E LD_LIBRARY_PATH="$libraries" -E LD_BIND_NOW=1 "$payload/usr/bin/gnome-control-center" --version
