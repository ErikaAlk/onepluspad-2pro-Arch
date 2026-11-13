# Arch Linux ARM 定制

本目录保存 Arch 配套包、已验证完整内核配置，以及基于上游内核的定制 Git 提交。构建和验证方法见 [`docs/ARCH.zh-CN.md`](../docs/ARCH.zh-CN.md)。

可选桌面组件在 [`appearance/`](appearance/)，保存两个改版扩展的固定来源、共享玻璃实现、原始参数和安装启停入口。使用方式见 [外观说明](../docs/APPEARANCE.zh-CN.md)。

内核基线：`v0.9.1` / `29eda7337ed1af7316ea93ea73465b10f8ebeaff`。
定制内核：`2fcc524a06da1bcd8d5937dd48fa7660d14e9155`。

`kernel-custom.bundle` 保存原提交、合并关系与全部本地修改，包含 UFCS、CCI/DMA 安全修复、gen4 帧尾填充和 ASoC 组件计数修复。完整配置启用 Rust Binder；Rust、bindgen 与 libclang 输入由 `kernel/rust-toolchain.json` 固定。Git bundle 需要上游基线历史，核验与取回均使用 Git 原生命令。

v0.9.1 的组件、构建入口和验证范围见[更新说明](../docs/ARCH-UPSTREAM-v0.9.1.zh-CN.md)。图形构建入口在 `graphics/`，GNOME51.1修复入口在 `gnome/`。
