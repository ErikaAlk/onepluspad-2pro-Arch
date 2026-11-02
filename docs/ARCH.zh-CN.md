# Arch Linux ARM

本仓库维护一加平板 2 Pro（OPD2413 / SM8750P）的 Arch Linux ARM 定制，基于上游 v0.6.0，使用 GNOME Wayland，并保留 Waydroid 和 Android 双系统。

## 源码

[`arch/source.json`](../arch/source.json) 固定上游基线、定制内核提交、完整配置和 Git bundle 的 SHA256。

| 内容 | 固定版本 |
|---|---|
| 上游内核 | `erhai-v0.6.0` / `70b572544d504735e2924f6c3f5fe3bd726ef275` |
| 定制内核 | `febfe4f53d2b83c0d115bd0972abdee1760154f7`，`7.2.14-erhai-arch-v06+` |
| Arch 配套源码 | `f9605bcc8f83d16293657cdca15b329e387baa53`，由保留分支 `feat/arch-v0.6` 提供 |
| Arch 支持包 | `erhai-upstream-support 0.6.0-1` |

`arch/kernel-custom.bundle` 保存定制内核的原始 Git 提交和合并关系，需与上游基线历史共同使用。它包含 UFCS 受电端与 SC8547A PHY、USBSS 充电路径、CCI/DMA 安全修复、gen4 帧尾填充以及限定 KUnit 测试。Waydroid、网络、Landlock 和 PSI 配置包含在已验证的完整内核配置中；单独配置片段也一并保留。

Arch 配套包包含前后摄软件 ISP 调校、电源键锁屏后休眠、合盖、SoCCP 和 chrony。休眠标志使用专用 RuntimeDirectory。校时优先使用 NTS，NetworkManager dispatcher 使用 chrony 自带的 DHCP 脚本接收网络提供的 NTP 来源。

## 构建

使用 Linux 文件系统中的工作目录，准备 Git、Python、base-devel、AArch64 交叉编译器、ccache、QEMU AArch64 和内核构建依赖。所有中间产物放在指定输出目录。

保留包源码分支，以便生成固定源码归档：

```sh
git fetch origin feat/arch-v0.6
```

准备内核、构建 Image/DTB/模块、运行限定相机缓冲区测试和构建 Arch 配套包。每条命令独立执行，目录参数请使用绝对路径：

```sh
bash arch/tools/prepare-kernel.sh /path/to/kernel-erhai-arch
bash arch/tools/build-kernel.sh /path/to/kernel-erhai-arch /path/to/out/kernel-erhai-arch
bash arch/tools/test-camss.sh /path/to/kernel-erhai-arch /path/to/out/camss-kunit
bash arch/tools/build-support.sh /path/to/out/arch-support
bash arch/tools/build-sensors.sh /path/to/out/arch-sensors
```

构建使用完整且带哈希的配置，独立于既有 v0.5 工作区。配套包是 `any` 架构的脚本、配置与固件包，可在主机上构建。依赖是否安装由目标 Arch 系统核验；在其他发行版构建时使用 Arch 构建环境。

传感器入口调用现有生产构建工具，从 `packaging/sensors/sources.json` 固定的源码、补丁、Ubuntu Base 和 APT snapshot 构建真实 AArch64 程序，再封装为 Arch 包；需要 qemu-user binfmt 和用户命名空间。它不要求预先持有本机缓存的 DEB。固定重建产物为 `erhai-sensors_0.4.0+b6762acb2_arm64.deb`，SHA256 `4c10ec6ba5670d1d9fb6a036c727c761d621911aaf84d61c1283b9f223900910`；三个程序、两个私有库与本机已验证的原生程序逐字节一致。设备自己的 registry 与 socinfo 由导入工具保存到设备，不能放进软件包或公开仓库。

## 已验证范围

2026-11-02：定制内核 Image、DTB、模块构建通过；限定 QEMU/KUnit 测试直接调用生产格式计算与 DMA 检查函数，覆盖前后摄采样模式、前摄完整模式、行宽边界、容量不足和地址要求。Arch 支持包隔离安装后内容检查为 46 个文件、0 项变化；服务、schema、chrony 配置和真实 systemd 沙箱的标志消费检查通过。

本机使用 C.35 启动身份生成签名候选，可信密钥及解包后的内核、设备树、ramdisk 已核验。设备专属原厂启动镜像、签名私钥、序列号、地址、个人数据及原始摄像头图像不放入本仓库。

本机已安装并从启动分区正常启动定制内核，GDM 自动登录、Arch 支持包内容检查和启动三件套逐字节读回通过。签名 boot SHA256 `7f6c5d77e98cccd8b746f863ea07fbedb8762a53aa1ba57c1c20993fc562dde5`。真实 Vulkan 240 帧绘制使用 Adreno 830v1；前摄 1632×1224、后摄 2104×1560 的严格 RAW 模式各采集 60 帧，后摄缓冲区长度为 4,118,528 字节。前后摄经软件 ISP 输出的图像模式也完成各 60 帧采集，软件 ISP 实际使用 Adreno 830v1。

传感器原生程序的 AArch64 动态加载、全部符号依赖与包内容检查通过，已取得真实加速度样本；平放静置后的重力校验未通过，自动旋转尚未验收通过。Waydroid 的 AArch64/Bionic 图形库和完整 GPU 条目已核验，本轮没有取得容器运行通过证据。休眠、电源键唤醒、充电会话和连续自动对焦尚未重测。用户结束平板验收后自行切回 Android，后续不再操作设备。上游 Ubuntu 的结论与本机此前版本的结论不能替代这些未验证项目。

## 安装边界

本目录提供源码与构建入口，尚未验证适用于其他设备的全新 Arch 安装流程。不得直接使用上游 Ubuntu 刷写命令替换现有 Arch 根系统。

Android 系统与用户数据必须保留。写启动分区前校验匹配固件的 Android 恢复镜像，保存当前 Linux 镜像与配置，并先用内存启动验证新内核。启动三件套必须作为一组校验，写入后逐字节读回，并进行冷启动验证。禁止更改活动槽、分区表或格式化现有分区。

UFCS/PPS 需要匹配的真实充电器和电量条件；驱动绑定与开关可写只说明初始化完成。手写笔事件与压感仍没有本机通过证据。完整系统镜像、对外发布和其他设备兼容性另行验证。
