#!/bin/bash
set -euo pipefail
repo=$(cd -- "$(dirname -- "$0")/../.." && pwd)
kernel=${1:?请指定尚不存在的内核目录}
test ! -e "$kernel"
test "$(sha256sum "$repo/arch/kernel-custom.bundle" | cut -d' ' -f1)" = 02fe8562bb648c4bd0cd6ddf6f2aebc03b19c83efe8368048cfedf4bccefdf83
git clone --filter=blob:none --single-branch --branch erhai-v0.6.0 \
    https://github.com/yzddmr6/linux-sm8750-erhai "$kernel"
test "$(git -C "$kernel" rev-parse HEAD)" = 70b572544d504735e2924f6c3f5fe3bd726ef275
git -C "$kernel" bundle verify "$repo/arch/kernel-custom.bundle"
git -C "$kernel" fetch "$repo/arch/kernel-custom.bundle" \
    refs/heads/feat/upstream-v0.6:refs/heads/arch/v0.6
git -C "$kernel" switch arch/v0.6
test "$(git -C "$kernel" rev-parse HEAD)" = febfe4f53d2b83c0d115bd0972abdee1760154f7
echo '定制内核源码已核验'
