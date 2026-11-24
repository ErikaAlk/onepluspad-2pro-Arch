# 一加平板 2 Pro Arch v0.12.2

Arch 使用上游 v0.12.2 的充电驱动和设备树。PPS 输入电流硬上限为 5 A，实际请求受适配器、线缆、电量和温度限制。升级 v0.9.1 时应停用该版本写入 `ufcs_enable` 的 tmpfiles 配置。运行中的协商状态可从 `/sys/class/power_supply/qcom-battmgr-usb/charge_contract` 读取。

Arch 软件包包含 GunyahVM 1.5.0、横竖屏扬声器映射、磁吸笔蓝牙服务、对焦相机、手电筒扩展、三档 TuneD 配置和自动亮度曲线。GNOME 51.1 的设置服务读取曲线，Shell 为无 EDID 的内置面板保存亮度。

## OPD2413 真机验证

- 启动三件套通过 AVB 签名验证。写入活动槽位并逐字节读回后，内核 `7.4.0-rc2-erhai-arch-v0122+` 从内部存储启动，GNOME Wayland 自动登录。
- 前后摄像头各采集两帧。宿主和 Waydroid 均使用 Adreno 830v1，完成真实渲染和像素读回，Android 设置应用进入前台。
- 电量 98% 时，连接的电源提供约 4.8 V，设备报告 PD 充电。PPS 上限读回 5000 mA，串行快充已启用。本次没有测到 PPS、UFCS 或 SUPERVOOC 高功率会话。
- 五个升级包通过 pacman 文件检查。已核实手写笔充电芯片和固件文件版本一致。压感、笔迹精度、扩展坞唤醒、休眠、Gunyah 客体启动和整盘新装未测试。

上游版本和硬件说明见 [v0.12.2 发布记录](https://github.com/yzddmr6/onepluspad-2pro-mainline/releases/tag/v0.12.2)。
