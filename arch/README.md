# Arch Linux ARM 定制

本目录保存 Arch 配套包、已验证完整内核配置，以及基于上游内核的定制 Git 提交。构建和验证方法见 [`docs/ARCH.zh-CN.md`](../docs/ARCH.zh-CN.md)。

可选桌面组件在 [`appearance/`](appearance/)，保存两个改版扩展的固定来源、共享玻璃实现、原始参数和安装启停入口。使用方式见 [外观说明](../docs/APPEARANCE.zh-CN.md)。

内核基线为 `v0.12.2`（`658c139dd9f3f51acd019545febb65f7a7956be2`）。Arch 定制提交为 `1b9526dfda28eb9b8790ab7e36ccc62207d463de`。

`kernel-custom.bundle` 保存相机 DMA、流关闭顺序和 ASoC 组件计数修复。充电驱动及设备树直接采用上游版本。完整配置启用 Rust Binder，Rust、bindgen 与 libclang 由 `kernel/rust-toolchain.json` 固定。

v0.12.2 的组件和验证范围见 [更新说明](../docs/ARCH-UPSTREAM-v0.12.2.zh-CN.md)。图形构建入口在 `graphics/`，GNOME 51.1 适配在 `gnome/`。
