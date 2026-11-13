#!/bin/bash
set -euo pipefail
if [ "$#" -ne 3 ]; then
  echo '用法：build-gnome.sh ARM64根目录 已准备源码缓存 输出目录' >&2
  exit 2
fi
sysroot=$(realpath "$1")
cache=$(realpath "$2")
output=$(realpath -m "$3")
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
jobs=${GNOME_BUILD_JOBS:-6}
mkdir -p "$output/toolchain" "$output/temp" "$output/payload/usr/lib" "$output/payload/usr/bin" "$output/payload/usr/share/glib-2.0/schemas" "$output/schemas"
export TMPDIR="$output/temp"
ln -sfn "$sysroot" "$output/toolchain/sysroot"
cp "$script_dir/cross.ini" "$output/toolchain/cross.ini"
cd "$cache"
sha256sum --check "$script_dir/SOURCE_SHA256SUMS"
python "$script_dir/verify-sources.py" "$cache"
for component in mutter gnome-settings-daemon gnome-control-center; do
  args=()
  case "$component" in
    mutter)
      args=(-Dintrospection=false -Dtests=disabled -Ddocs=false -Ddevkit=disabled -Dxwayland_path=/usr/bin/Xwayland)
      ;;
    gnome-control-center)
      args=(-Dtests=false -Ddocumentation=false -Dsnap=false)
      args+=("-Dc_args=['--sysroot=$sysroot', '-isystem', '$sysroot/usr/include', '-include', '$output/stage-gnome-settings-daemon/usr/include/gnome-settings-daemon-51/gnome-settings-daemon/gsd-enums.h', '-fstack-protector-strong', '-fstack-clash-protection', '-D_FORTIFY_SOURCE=3', '-fno-plt', '-fno-semantic-interposition']")
      ;;
  esac
  setup=()
  if [ -f "$output/build-$component/build.ninja" ]; then
    setup+=(--reconfigure)
  fi
  meson setup "${setup[@]}" "$output/build-$component" "$cache/$component-51.1" --cross-file "$output/toolchain/cross.ini" --prefix=/usr --libexecdir=/usr/lib --buildtype=release "${args[@]}"
  ninja -C "$output/build-$component" -j"$jobs"
  DESTDIR="$output/stage-$component" meson install -C "$output/build-$component" --no-rebuild
done
install -m755 "$output/stage-mutter/usr/lib/libmutter-51.so.0.0.0" "$output/payload/usr/lib/"
install -m755 "$output/stage-gnome-settings-daemon/usr/lib/gsd-media-keys" "$output/payload/usr/lib/"
install -m755 "$output/stage-gnome-settings-daemon/usr/lib/gsd-power" "$output/payload/usr/lib/"
install -m755 "$output/stage-gnome-control-center/usr/bin/gnome-control-center" "$output/payload/usr/bin/"
for schema in org.gnome.settings-daemon.enums.xml org.gnome.settings-daemon.plugins.power.gschema.xml; do
  install -m644 "$output/stage-gnome-settings-daemon/usr/share/glib-2.0/schemas/$schema" "$output/payload/usr/share/glib-2.0/schemas/"
done
cp -a "$sysroot/usr/share/glib-2.0/schemas/." "$output/schemas/"
cp "$output/payload/usr/share/glib-2.0/schemas/"*.xml "$output/schemas/"
qemu-aarch64-static -L "$sysroot" "$sysroot/usr/bin/glib-compile-schemas" --strict "$output/schemas"
cd "$output/payload"
files=(usr/lib/gsd-media-keys usr/lib/gsd-power usr/lib/libmutter-51.so.0.0.0 usr/bin/gnome-control-center usr/share/glib-2.0/schemas/org.gnome.settings-daemon.enums.xml usr/share/glib-2.0/schemas/org.gnome.settings-daemon.plugins.power.gschema.xml)
sha256sum "${files[@]}" > "$output/PAYLOAD_SHA256SUMS"
tar -cJf "$output/gnome-51.1-power-fixes-aarch64.tar.xz" "${files[@]}"
sha256sum "$output/gnome-51.1-power-fixes-aarch64.tar.xz"
