#!/bin/bash
set -euo pipefail
repo=$(cd -- "$(dirname -- "$0")/../.." && pwd)
kernel=$(realpath "${1:?请指定已准备的内核源码目录}")
output=$(realpath -m "${2:?请指定内核输出目录}")
test "$(git -C "$kernel" rev-parse HEAD)" = febfe4f53d2b83c0d115bd0972abdee1760154f7
test "$(sha256sum "$repo/arch/config/kernel.config" | cut -d' ' -f1)" = 029b5e1e11e5c5ad4af26b98e14beddbf42d6c9a1fa22951a985bd892fe69dcf
mkdir -p "$output/build-temp"
export TMPDIR=$output/build-temp
cp "$repo/arch/config/kernel.config" "$output/.config"
make -C "$kernel" O="$output" ARCH=arm64 CROSS_COMPILE=aarch64-linux-gnu- olddefconfig
make -C "$kernel" O="$output" ARCH=arm64 CROSS_COMPILE=aarch64-linux-gnu- \
    CC='ccache aarch64-linux-gnu-gcc' -j"${JOBS:-8}" Image modules qcom/sm8750-erhai.dtb
make -C "$kernel" O="$output" ARCH=arm64 CROSS_COMPILE=aarch64-linux-gnu- \
    INSTALL_MOD_PATH="$output/stage" modules_install
git -C "$kernel" rev-parse HEAD > "$output/kernel-commit.txt"
sha256sum "$output/arch/arm64/boot/Image" "$output/arch/arm64/boot/dts/qcom/sm8750-erhai.dtb"
