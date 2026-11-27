# Pencil 2 Pro

适用于一加平板 2 Pro 的 Arch v0.12.2 内核 `7.4.0-rc2-erhai-arch-v0122+`。在 OPD2413（16 GB，ColorOS 17.0.0.103）上，蓝牙名称为 `OnePlus Pencil Pro` 的手写笔已验证磁吸识别、蓝牙电量、笔尖坐标和压感。采集到 2,890 次压力变化，读数范围为 0–12073。未验证整机冷启动后的重连、笔身按键和笔迹偏移。

在 Linux 构建机上，使用[仓库的内核构建流程](../../docs/ARCH.zh-CN.md)准备匹配的内核源码和完整构建目录。在仓库根目录运行以下命令，三个参数依次是源码目录、构建目录和模块输出目录。

```sh
bash arch/pencil2pro/build.sh /path/to/kernel /path/to/kernel-build "$PWD/out/pen"
```

将生成的 `out/pen/pencil2pro` 整个目录复制到平板，在该目录执行 `sudo bash install.sh`。保存工作并重新启动 Arch，将笔吸附到充电位置。首次配对时在 GNOME 蓝牙设置中连接 `OnePlus Pencil Pro`；配对完成后取下笔，在支持压感的应用中书写。开机服务会选择这支笔对应的扫描指令 `0x13`。

CPS8601 模块调整笔座的中断上拉、唤醒和复位时序。NT36536 模块沿用原有触控驱动并支持选择扫描指令。两个模块安装在当前内核的 `updates/` 目录，仅适用于上述内核版本。时序与扫描指令参考一加的[笔座驱动](https://github.com/OnePlusOSS/android_kernel_modules_and_devicetree_oneplus_sm8750/blob/oneplus/sm8750_b_16.0.0_pad_2_pro/vendor/oplus/kernel/charger/wireless_pen/oplus_cps8601.c)和[触控驱动](https://github.com/OnePlusOSS/android_kernel_modules_and_devicetree_oneplus_sm8750/blob/oneplus/sm8750_b_16.0.0_pad_2_pro/vendor/oplus/kernel/touchpanel/oplus_touchscreen_v2/Novatek/NT36536_noflash/nvt_drivers_nt36536_noflash.c)。

## English

On the OPD2413 with Arch v0.12.2, the Pencil 2 Pro was verified to dock, pair, report its battery level and write with pressure. From the repository root, run the build command above with the matching kernel source and build directories. Copy the complete generated `pencil2pro` directory to the tablet, run `sudo bash install.sh` there, save your work and restart Arch. Dock the pen and pair **OnePlus Pencil Pro** in GNOME Bluetooth settings, then undock it to write. Cold-boot reconnection, pen buttons and geometric accuracy have not been verified.
