#!/bin/bash
set -euo pipefail
source_dir=${1:?请指定 v0.12.2 内核源码目录}
kernel_build=${2:?请指定当前内核的构建目录}
output=${3:?请指定独立的模块构建目录}
support=$(dirname "$(realpath "$0")")
test "$(git -C "$source_dir" rev-parse HEAD)" = 1b9526dfda28eb9b8790ab7e36ccc62207d463de
test "$(cat "$kernel_build/include/config/kernel.release")" = 7.4.0-rc2-erhai-arch-v0122+
install -d "$output/charger" "$output/touch"
cp "$source_dir"/drivers/power/supply/{cps8601.c,cps8601_bl.h,erhai_otg_glink.h} "$output/charger/"
cp "$source_dir"/drivers/input/touchscreen/nt36536/*.{c,h} "$output/touch/"
cp "$support/charger.Kbuild" "$output/charger/Kbuild"
cp "$support/touch.Kbuild" "$output/touch/Kbuild"
patch "$output/charger/cps8601.c" -i "$support/cps8601.patch"
patch "$output/touch/nt36536.c" -i "$support/nt36536.patch"
for module in charger touch; do
    make -C "$kernel_build" M="$(realpath "$output/$module")" ARCH=arm64 CROSS_COMPILE=aarch64-linux-gnu- modules
done
install -d "$output/pencil2pro"
install -m644 "$output/charger/cps8601.ko" "$output/touch/nt36536_pen.ko" \
    "$support/80-erhai-pencil2pro.rules" "$support/erhai-pencil2pro.service" "$output/pencil2pro/"
install -m755 "$support/install.sh" "$support/enable-pen.sh" "$output/pencil2pro/"
