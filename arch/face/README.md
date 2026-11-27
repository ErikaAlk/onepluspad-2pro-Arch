# 本地面容认证

适用于 OPD2413 的 SC820CS 前摄、Arch GNOME Shell 51.1、Polkit 128-1，以及仓库配套的 Mesa 和 libcamera。普通 RGB 摄像头缺少活体检测，照片可能通过认证。启用前保留可用的管理员密码。识别模板在本机录入，模板目录由 root 独占，成功和失败快照默认关闭。

## 构建与录入

1. 在平板正常使用前摄并确认 GNOME 相机可取景。以普通用户检出本仓库，从仓库根目录执行 `sudo bash arch/face/tools/prepare-python.sh`，为系统认证准备 Python dlib 20.0.1。
2. 进入 `arch/face/package`，以普通用户运行 `makepkg -si`。PKGBUILD 校验 Howdy 源码和两个 dlib 公共模型，编译 PAM 模块，安装配置。新装配置保持禁用。
3. 确认当前图形用户的 UID 为 1000。使用 `sudo howdy --user "$USER" add` 为本人录入，然后运行 `sudo howdy disable 0` 启用识别。用 `sudo howdy --user "$USER" test` 检查采集效果后退出测试，释放摄像头。`sudo howdy disable 1` 可以停用识别。
4. 回到仓库根目录，运行 `sudo bash arch/face/tools/install-camera-auth-experience.sh`。此命令会安装 GNOME 面容提示、系统认证服务，并更新 sudo、su、login 和 Polkit 的 PAM 配置。安装器核对当前策略的基线，并将原文件保存在 root 专用的 `/var/lib/erhai/system-face-auth`。生效后重新登录 GNOME。
5. 需要 GNOME 锁屏面容认证时，比较 `arch/face/config/gdm-password` 与本机现有 GDM 策略，核对前置账户限制、失败计数和原密码通道均保留，再备份原文件并将已核对的配置安装到 `/etc/pam.d/gdm-password`。维持现有管理员会话，分别验证正常密码、面容成功与摄像头遮挡后的密码验证。

面容模块只为 UID 1000 对应的本地账户授权；系统服务检查请求程序、会话与终端。桌面系统认证需要本人确认。更换 Python 版本后需为新解释器重新构建 dlib。在原机上，GNOME 锁屏、真实 sudo、遮挡拒绝和密码解锁已验证；su、初始控制台和 Polkit 的完整交互尚未逐项验收。

Howdy 基于 MIT 许可的[固定上游源码](https://github.com/boltgolt/howdy/tree/d3ab99382f88f043d15f15c1450ab69433892a1c)。补丁提供 GStreamer 采集、识别进程时限和面容模板权限处理。预训练模型的来源与训练说明见 [dlib-models](https://github.com/davisking/dlib-models)。

## English

This optional profile enables RGB face authentication for the local UID 1000 account on the OPD2413. RGB face recognition can be fooled by a photograph. Prepare the Python environment, build the package with makepkg, enrol locally and retain a working password before enabling the PAM profiles. The original device was tested for GNOME unlock, sudo, denial with a covered camera and password access. The public installer has not been exercised on a fresh tablet.
