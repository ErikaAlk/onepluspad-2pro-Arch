# 一加平板 2 Pro · Arch Linux ARM

在一加平板 2 Pro 上运行 Arch Linux ARM、GNOME Wayland，并与 Android 双系统共存。此仓库维护 ErikaAlk 的定制内核、Arch 配套包与桌面外观，基于 [yzddmr6/onepluspad-2pro-mainline](https://github.com/yzddmr6/onepluspad-2pro-mainline)。

目前提供源码与构建入口，尚未发布可供其他设备直接安装的完整 Arch 镜像。已验证设备为 OPD2413、SM8750P、16 GB / 512 GB、ColorOS C.35；其他机型、容量和固件尚未验证。

## 当前状态

上游基线为 v0.6.0，定制内核为 `7.2.14-erhai-arch-v06+`。保留 UFCS/PPS、Waydroid 所需配置、USBSS 充电路径和相机 CCI/DMA 安全修复；内核、支持包和传感器程序均有固定源码构建入口。

| 项目 | 本机验证范围 |
|---|---|
| 启动与桌面 | v0.6 已持久安装并正常启动，GDM 自动登录、GNOME Wayland 可用 |
| 图形 | Adreno 830v1，真实 Vulkan 240 帧绘制通过 |
| 相机 | 前摄 1632×1224、后摄 2104×1560 严格 RAW 各 60 帧；软件 ISP 图像模式各 60 帧通过 |
| 传感器 | 原生组件与设备配置已补齐，真实加速度可读；平放静置后的重力校验失败，自动旋转尚未通过 |
| Waydroid | 保留集成；AArch64/Bionic 图形库与 GPU 条目已核验，本轮未取得容器运行通过证据 |
| 充电 | 保留 PD、PPS 与 UFCS 相关实现；本轮未验证真实充电会话，原厂 SUPERVOOC 不可用 |
| 休眠与唤醒 | 已整合上游修复，本轮未重测 |
| 手写笔 | 保留驱动支持，位置、压感与防飘移尚无本机通过证据 |

上述记录对应 2026-11-02 的本机验收。完整构建、安装边界与限制见 [Arch 说明](docs/ARCH.zh-CN.md)。上游 Ubuntu 的硬件结论分别保存在其文档中。

## 构建内核与设备支持包

在 Linux 文件系统中工作，准备 Git、Python、base-devel、AArch64 交叉编译器、ccache 与 QEMU AArch64。详细依赖和构建过程见 [Arch 说明](docs/ARCH.zh-CN.md)；固定版本与哈希见 [`arch/source.json`](arch/source.json)。

```sh
git clone https://github.com/ErikaAlk/onepluspad-2pro-Arch.git
cd onepluspad-2pro-Arch
git fetch origin feat/arch-v0.6
bash arch/tools/prepare-kernel.sh "$PWD/out/kernel"
bash arch/tools/build-kernel.sh "$PWD/out/kernel" "$PWD/out/kernel-build"
bash arch/tools/test-camss.sh "$PWD/out/kernel" "$PWD/out/camss-kunit"
bash arch/tools/build-support.sh "$PWD/out/support"
bash arch/tools/build-sensors.sh "$PWD/out/sensors"
```

这些入口输出内核、模块和 Arch 配套包。完整根系统装配与适用于其他设备的全新安装流程尚未完成公开验收。

## 可选：洱海玻璃外观

外观组件独立于内核和硬件支持包。需要这套界面时，在现有 GNOME Shell 51 中单独安装和启用。

| 组件 | 改造内容 |
|---|---|
| [Lintel 改版](https://github.com/ErikaAlk/lintel) | 菜单栏、应用实际导出的菜单、触控控制中心、日历通知、实时充电功率 |
| [Glasslight 改版](https://github.com/ErikaAlk/glasslight) | 启动台、应用文件夹、触控拖动、搜索、键盘整理与中文输入法适配 |
| `erhai-motion` + Blur my Shell 77 | 实时背景捕获、折射、模糊、连续圆角、动态明暗与弹性动效 |
| MacTahoe + Dash to Dock | 深色 GTK / Shell、图标和光标、底部居中的常驻 Dock，单独选择加载 |

精调玻璃参数、GLSL 着色器和样式完整保存在 [`arch/appearance/`](arch/appearance/)。共享材质使用饱和度 `1.05`、折射模糊半径 `14`、色散 `0.03`、高光强度 `0.10`、噪点 `0.025`、圆角平滑度 `0.6`，同时保留桌面原始管线配置。

按 [外观安装说明](docs/APPEARANCE.zh-CN.md) 准备依赖后执行：

```sh
bash arch/appearance/build.sh "$PWD/out/appearance"
bash arch/appearance/install.sh "$PWD/out/appearance"
gjs -m arch/appearance/configure.js enable
```

退出 GNOME 并重新登录后加载。`Super+A` 或 Dock 的应用按钮打开启动台。停用并恢复启用前的玻璃参数及相关扩展状态：

```sh
gjs -m arch/appearance/configure.js disable
```

MacTahoe、Dock、GTK4 和字体的安装方式、完整外观选项、依赖版本与验证范围，见 [外观安装说明](docs/APPEARANCE.zh-CN.md)。未选择外观选项时，内核和设备支持包的构建不会安装或启用这些扩展。

## 安装与双系统

Android 系统与用户数据必须保留。首次解锁或重新分区会清除数据，执行前必须完成备份，准备匹配当前固件的恢复镜像。写启动分区前先以内存启动验证，保存当前 Android 与 Linux 的启动三件套；写入后读回校验，再验证正常启动。

现有双系统通过 [切换组件](switch/README.md) 切换启动三件套并重启。切换时会写入 `boot`、`init_boot`、`vendor_boot`，操作期间保持供电，避免中断。目录名称中保留上游的 `ubuntu` 标识，具体根系统可为本项目 Arch。

[上游安装与恢复文档](docs/FLASHING.md) 描述 Ubuntu 安装流程，阅读时须核实固件和分区要求。本仓库当前没有面向其他设备验证完成的 Arch 一键安装流程。

## 文档与来源

- [Arch 源码、构建与本机验证](docs/ARCH.zh-CN.md)
- [可选外观与两个改版扩展](docs/APPEARANCE.zh-CN.md)
- [图形与 Mesa](docs/GRAPHICS.md)、[传感器](docs/SENSORS.md)、[休眠](docs/SUSPEND.md)
- [上游集成仓库](https://github.com/yzddmr6/onepluspad-2pro-mainline) 与 [上游内核](https://github.com/yzddmr6/linux-sm8750-erhai)

感谢原作者与 Linux、Arch Linux ARM、GNOME、Freedreno/Mesa、Linux Qualcomm 社区，以及各组件的贡献者。原始集成代码按 [GPL-2.0-only](LICENSE) 分发；内核、桌面扩展和第三方资源遵循各自许可，详见 [NOTICE](NOTICE) 与 [固件来源](packaging/firmware/README.md)。个人设备配置、签名私钥、字体原件和原始摄像头图像不随源码发布。
