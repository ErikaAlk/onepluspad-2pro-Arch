# GNOME 屏幕键盘

适用于 GNOME Shell 51 Wayland。触碰可编辑控件时显示原生屏幕键盘，也可从顶部按钮打开。AT-SPI 用户服务只读取前台控件的角色、状态与位置，输入内容保留在应用内。

安装 `gnome-shell`、`gjs`、`python-gobject` 和 `at-spi2-core` 后，在仓库根目录执行：

```sh
sudo bash arch/keyboard/install.sh
systemctl --user daemon-reload
gjs -m arch/keyboard/enable.js
```

退出 GNOME 会话后重新登录。停用扩展可运行 `gnome-extensions disable erhai-keyboard@erhai.local`。构建根文件系统时，向安装脚本传入目标根目录；启用命令应由实际桌面用户在自己的会话中执行。

On GNOME 51 Wayland, run the commands above as the desktop user, then log out and back in. The optional extension works independently of the appearance extensions.
