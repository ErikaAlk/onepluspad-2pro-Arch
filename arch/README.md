# Arch Linux ARM 定制

本目录保存 Arch 配套包、已验证完整内核配置，以及基于上游内核的定制 Git 提交。构建和验证方法见 [`docs/ARCH.zh-CN.md`](../docs/ARCH.zh-CN.md)。

可选桌面组件在 [`appearance/`](appearance/)，保存两个改版扩展的固定来源、共享玻璃实现、原始参数和安装启停入口。使用方式见 [外观说明](../docs/APPEARANCE.zh-CN.md)。

内核基线：`erhai-v0.6.0` / `70b572544d504735e2924f6c3f5fe3bd726ef275`。
定制内核：`febfe4f53d2b83c0d115bd0972abdee1760154f7`。

`kernel-custom.bundle` 保存原提交、合并关系与全部本地修改，包含 UFCS、Waydroid 所需配置配合项、CCI/DMA 安全修复和 gen4 帧尾填充修复。它需要上游基线历史，核验与取回均使用 Git 原生命令。
