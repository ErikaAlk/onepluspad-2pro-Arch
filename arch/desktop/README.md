# Arch GNOME 桌面配置

以下各项可以单独启用。命令从仓库根目录执行。

## 中文桌面与英文终端

在 `/etc/locale.gen` 中启用 `zh_CN.UTF-8 UTF-8` 和 `en_US.UTF-8 UTF-8`，然后执行：

```sh
sudo pacman -S --needed gnome-console
sudo locale-gen
sudo localectl set-locale LANG=zh_CN.UTF-8
sudo install -Dm644 arch/desktop/org.gnome.Console.desktop /usr/local/share/applications/org.gnome.Console.desktop
sudo install -Dm755 arch/desktop/x-terminal-emulator /usr/local/bin/x-terminal-emulator
install -Dm644 arch/desktop/english-bash.sh ~/.config/erhai/english-bash.sh
```

在现有的 `~/.bashrc` 末尾添加 `source ~/.config/erhai/english-bash.sh`。重新登录后打开 GNOME Console，执行 `locale` 应显示英文，桌面仍使用中文。已有个人语言设置时，在 GNOME 设置的「系统 → 区域与语言」中选择中文。

## 文件管理器中的内置分区

安装设备专用的 UDisks 规则后，文件管理器会隐藏内置 UFS 辅助分区，保留 Linux 根分区和外接存储。规则只改变桌面中的可见性。

```sh
sudo install -Dm644 arch/desktop/99-erhai-internal-volumes.rules /etc/udev/rules.d/99-erhai-internal-volumes.rules
sudo udevadm control --reload
sudo udevadm trigger --subsystem-match=block --property-match=DEVTYPE=partition --action=change
```

## 应用窗口

在 Chrome 的「设置 → 外观」中选择 GTK 主题并启用系统标题栏和边框，对应的配置值见 [Chrome 配置片段](chrome-window-preferences.json)。在 VS Code 的「首选项：打开用户设置(JSON)」中加入 [VS Code 配置片段](code-window-settings.json)的两个属性，保留原有设置，然后重启应用。

## 微信输入法

在平板的 Arch Linux ARM 系统安装依赖。从[上游 v0.1.8 发布页](https://github.com/yu1745/wetype-ime-linux/releases/tag/v0.1.8)下载 `WeTypeIME-Engine-aarch64.AppImage` 到当前目录。校验通过后运行上游安装程序，由它获取所需资源。

```sh
sudo pacman -S --needed fcitx5 fcitx5-qt fcitx5-gtk fcitx5-configtool python patchelf fuse2
sha256sum -c arch/desktop/wetype.sha256
chmod +x WeTypeIME-Engine-aarch64.AppImage
sudo ./WeTypeIME-Engine-aarch64.AppImage install --system
install -Dm644 arch/desktop/wetype.conf ~/.config/environment.d/70-erhai-wetype.conf
```

如果当前桌面尚未设置 Fcitx 5 自动启动，执行：

```sh
install -Dm644 arch/desktop/fcitx5.desktop ~/.config/autostart/fcitx5.desktop
```

重新登录 GNOME Wayland 后打开 `fcitx5-configtool`，取消「仅显示当前语言」，在现有输入法分组中添加微信输入法（标识为 `wetype-im`）。切换到微信输入法，在文本编辑器中输入拼音并选择候选词。GTK 应用使用 GNOME 的 Wayland 文本输入协议，请保留默认的 GTK 输入模块设置。
