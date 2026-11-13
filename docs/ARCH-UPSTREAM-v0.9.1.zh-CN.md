# Arch 跟进上游 v0.9.1

集成基线为上游 `25325453637b1f9f4c128d969269a5a132111f78`，包含 v0.6.0 之后的 114 个提交。内核基线 `v0.9.1` / `29eda7337ed1`，定制提交、配置和 Git bundle 的校验值见 `arch/source.json`。

## 更新范围

| 内容 | Arch 集成 |
|---|---|
| Linux 7.4-rc2 | 新增外设、zram、Rust Binder、Gunyah、UDMABUF 与 CDSP 配置，保留本机 Waydroid 配置 |
| GPU | 合入大提交分配、写回内存导入、恢复和同步修复，Mesa 使用完整 A830v1 补丁组合 |
| 充电 | 保留上游 PPS 4 A 上限、窗口恢复与固定 PD 休眠交接；UFCS 适配新控制器和 USBSS 所有权 |
| 笔无线充电 | 合入 CPS8601 驱动；笔尖输入、压感及防飘移仍分别验收 |
| 相机 | 合入上游新驱动与图像处理，保留 CCI 初始化、连续 DMA 容量、256 字节帧跨度及异常启动清理 |
| 视频 | 更新 Iris 编码、参数控制、RGB→NV12 VideoProc 与 AV1 能力限制 |
| 传感器 | 重建 RPC、libssc 与 SensorProxy；补齐休眠流暂停及卸载清理 |
| 电源管理 | TuneD 三档模式、zstd 压缩交换空间、插电只熄屏和合盖锁屏 |
| 桌面 | 将锁屏按键、环境光零读数、Mutter 注销修复移植至 GNOME 51.1，保留 XWayland 修复 |
| NPU | Hexagon v79 运行程序、原厂 DSP 输入和本地模型；命令明确选择推理后端 |
| 虚拟机 | GunyahVM 1.2.0、Linux/Windows 客体组件及 Casilda 私有依赖 |
| 应用 | Resources 设备遥测与更新通知 |
| 双系统 | 电量门槛、槽位一致性、写前保存、读回和失败处理，完整安装共享辅助脚本 |
| 根文件系统 | NCM initramfs 在可写挂载前执行发行版 e2fsck，携带完整 Arch ARM64 依赖 |

精调外观仍由 `arch/appearance` 单独管理，着色器、材质参数、Dock 参数和扩展加载顺序保持原值。个人收藏、账户、传感器标定和 Android 镜像库属于现有设备数据。

## 构建入口

内核需要 `kernel/rust-toolchain.json` 所列 Rust 1.85.0、bindgen 0.72.1 和 Clang/LLVM 22.1.8 输入；构建前设置 `RUSTC`、`RUST_LIB_SRC`、`BINDGEN`、`LIBCLANG_PATH`，并让 `LD_LIBRARY_PATH` 包含匹配的 Clang/LLVM 库目录。构建入口将工具作为 Makefile 命令行参数传入，并检查最终配置中的 Rust 与 Rust Binder。使用 `python-pyelftools` 构建文件系统检查闭包。

```sh
bash arch/tools/prepare-kernel.sh /path/to/kernel
bash arch/tools/build-kernel.sh /path/to/kernel /path/to/kernel-output
bash arch/tools/test-camss.sh /path/to/kernel /path/to/camss-output
bash arch/tools/build-support.sh /path/to/support-output
bash arch/tools/build-runtime.sh /path/to/runtime-output
bash arch/tools/build-sensors.sh /path/to/sensors-output
```

支持包与运行组件归档从固定上游提交生成。运行组件使用 `m4`、`alsatplg` 从固定 AudioReach 源码构建声卡拓扑；传感器构建使用锁定快照和真实原生程序，生成的 DEB 先核验，再包装为 Arch 包。全部管理程序安装至 `/usr/bin`，保持 Arch 的 `/usr/sbin -> bin`。

图形构建见 [arch/graphics/README.md](../arch/graphics/README.md)，GNOME 构建见 [arch/gnome/README.md](../arch/gnome/README.md)。两者使用目标 Arch ARM64 根目录提供的真实开发库，构建输出与根目录隔离。

NPU 使用上游 `tools/build-npu.py` 从固定源码构建，再通过 `arch/tools/build-npu.sh` 包装三件 Arch 包。GunyahVM 使用 `packaging/gunyahvm/source.json` 所列附件及完整依赖，通过 `arch/tools/build-gunyahvm.sh` 包装。Resources 输入和校验值沿用 `packaging/resources/source.json`。

NCM initramfs 使用 `ROOT_FSCK_LAYOUT=arch` 和 `ROOT_FSCK_ROOT=/path/to/verified-arch-root`。文件系统检查程序、动态加载器及依赖均来自同一根目录，生成清单保存逐文件 SHA256。维护启动与日常启动分别封装，日常镜像不包含 `systemd.unit=multi-user.target`。

## 验证范围

内核 Image、设备树和全部配置模块已构建；CAMSS 限定 KUnit 通过；UFCS 五个对象及设备树编译通过，并完成独立错误路径复审。GNOME 三组件、Mesa 宿主/Android 与 Iris 均完成真实构建，目标架构加载及限定检查通过。

Arch e2fsck 闭包已在 QEMU 中真实执行，并对独立 ext4 测试镜像完成 preen。维护与日常三件套完成可信密钥验证，解包后的内核、设备树和 ramdisk 与输入逐字节一致，C.35 身份及全部 16 个 DTBO 条目覆盖通过。

定制内核 `2fcc524a06da1bcd8d5937dd48fa7660d14e9155` 已安装至平板并从内部存储启动，Image SHA256 为 `0a65fb39c031df1b12c93ae051bf21170d386b5ec397c33bf4ba64997a10f065`，签名日常 boot SHA256 为 `660fa59ec9da30886e10bffded26dd12e3278cf045d66f10843ebc56ab7b90cf`。三件套写入后逐字节读回一致，Android 镜像和用户数据保留。

真机通过：GDM 自动登录和 GNOME 51.1 设置窗口；宿主与 Waydroid 的完整 GPU ID、Adreno 830v1 渲染、真实缓冲区及像素读回；前后摄像头连续采集；传感器重力采样；音频播放；NPU 混合后端中文推理；Iris RGB→NV12、H.264 编码与硬件解码，解码结果与 CPU 的 SHA256 一致。Waydroid 的纯 64 位系统和设置应用启动通过。GunyahVM 管理界面与运行组件已安装并启动，尚未创建客体系统。

电源验收包含五轮息屏唤醒和 RTC 唤醒的 s2idle 进入、恢复；Landlock 已启用，pacman 恢复文件系统隔离并完成真实下载与签名安装。PPS/UFCS 开关读回通过，电脑 USB 供电场景尚未验证对应快充会话；笔无线充电和外接显示仍需相应配件场景。验收日志与本机数据保存在安装方的私有工作区。

## 使用边界

内置扬声器缺少原厂 DSP 保护，保持原厂功放电平也不能证明长期满音量播放安全；`erhai-audio-speaker disable` 可持久关闭。快充受适配器、电芯温度和电量限制；USB 电脑连接不等同于 PPS 或 UFCS 充电会话。

`npu-demo` 默认使用混合后端，`--backend npu` 和 `--backend cpu` 分别明确选择后端；失败会终止，不自动切换。临时提示文件写入 `XDG_RUNTIME_DIR`。

安装先检查固件、电量、恢复镜像和 Linux 数据备份。启动三件套必须整组保存及校验；完整升级完成后再启动新内核。Android 系统与用户数据保留，切换期间保持供电。
