# 一加平板 2 Pro · Arch Linux ARM

在一加平板 2 Pro 上运行 Arch Linux ARM、GNOME Wayland，并与 Android 双系统共存。此仓库维护 ErikaAlk 的 Arch 适配与桌面外观，基于 [yzddmr6/onepluspad-2pro-mainline](https://github.com/yzddmr6/onepluspad-2pro-mainline)。

目前提供源码与构建入口。验证机型为 OPD2413、SM8750P、16 GB / 512 GB，Android 固件为 ColorOS 17.0.0.103。

## 上游更新

Arch 已同步上游 v0.12.2，采用上游充电驱动、处理器电源策略和自动亮度曲线。真机已从内部存储启动，GNOME Wayland、前后摄采集、宿主和 Waydroid 的 Adreno 830v1 实际渲染通过。验证范围见 [v0.12.2 更新说明](docs/ARCH-UPSTREAM-v0.12.2.zh-CN.md)。

## 桌面输入

GNOME 51 的可选[屏幕键盘](arch/keyboard/README.md)支持触碰输入框自动显示，也可以从顶部按钮打开。

Pencil 2 Pro 在 OPD2413 的 Arch v0.12.2 上已验证磁吸识别、蓝牙连接、书写和压感。使用这支笔时，请安装[手写笔适配模块](arch/pencil2pro/README.md)。

## 构建

在 Linux 文件系统中工作，准备 Git、Python、base-devel、AArch64 交叉编译器、ccache 与 QEMU AArch64。固定来源见 [`arch/source.json`](arch/source.json)，构建方式见 [Arch 说明](docs/ARCH.zh-CN.md)。

完整根系统装配与面向其他设备的全新安装流程仍须独立验收。

## 可选：洱海玻璃外观

外观组件独立于内核和硬件支持包，在 GNOME Shell 51 中单独安装和启用。

| 组件 | 功能 |
|---|---|
| [Lintel 改版](https://github.com/ErikaAlk/lintel) | 菜单栏、应用菜单、触控控制中心、日历通知与充电功率 |
| [Glasslight 改版](https://github.com/ErikaAlk/glasslight) | 启动台、应用文件夹、触控拖动、搜索与中文输入法适配 |
| `erhai-motion` + Blur my Shell 77 | 实时背景捕获、折射、模糊、连续圆角与弹性动效 |
| MacTahoe + Dash to Dock | 深色主题、图标、光标与底部 Dock |

精调玻璃参数、GLSL 着色器和样式保存在 [`arch/appearance/`](arch/appearance/)。共享材质保持饱和度 `1.05`、折射模糊半径 `14`、色散 `0.03`、高光强度 `0.10`、噪点 `0.025`、圆角平滑度 `0.6`，保留完整桌面管线和加载顺序。

按 [外观安装说明](docs/APPEARANCE.zh-CN.md)准备依赖后执行：

```sh
bash arch/appearance/build.sh "$PWD/out/appearance"
bash arch/appearance/install.sh "$PWD/out/appearance"
gjs -m arch/appearance/configure.js enable
```

退出 GNOME 并重新登录后加载。`Super+A` 或 Dock 应用按钮打开启动台。停用并恢复启用前的参数及扩展状态：

```sh
gjs -m arch/appearance/configure.js disable
```

完整外观选项、依赖与验证范围见 [外观安装说明](docs/APPEARANCE.zh-CN.md)。

## 安装与双系统

保留 Android 系统与用户数据。首次解锁或重新分区会清除数据，执行前完成备份，准备匹配当前固件的恢复镜像。写启动分区前以内存启动验证，保存 Android 与 Linux 的启动三件套，写入后读回校验并验证正常启动。

现有双系统通过[切换组件](switch/README.md)更新 `boot`、`init_boot`、`vendor_boot` 并重启，操作期间保持供电，避免中断。切换库沿用 `ubuntu` 标识，根系统可为 Arch。

[上游安装与恢复文档](docs/FLASHING.md)描述 Ubuntu 流程；本仓库的 Arch 安装以 [Arch 说明](docs/ARCH.zh-CN.md)为准。

## 文档与来源

- [Arch 源码、构建与本机验证](docs/ARCH.zh-CN.md)
- [上游 v0.9.1 适配](docs/ARCH-UPSTREAM-v0.9.1.zh-CN.md)
- [可选外观](docs/APPEARANCE.zh-CN.md)
- [图形](docs/GRAPHICS.md)、[传感器](docs/SENSORS.md)、[休眠](docs/SUSPEND.md)
- [上游集成仓库](https://github.com/yzddmr6/onepluspad-2pro-mainline)与[上游内核](https://github.com/yzddmr6/linux-sm8750-erhai)

感谢原作者与 Linux、Arch Linux ARM、GNOME、Freedreno/Mesa 和 Linux Qualcomm 社区。原始集成代码按 [GPL-2.0-only](LICENSE)分发；第三方组件遵循各自许可，见 [NOTICE](NOTICE)与[固件来源](packaging/firmware/README.md)。设备配置、签名私钥、字体原件与原始摄像头图像不随源码发布。
