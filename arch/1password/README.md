# 1Password 系统认证

使用[官方 Linux 安装说明](https://support.1password.com/install-linux/)安装 ARM64 桌面版本并完成安装程序提供的系统集成。平板验证的版本为 8.12.42，可执行文件为 `/opt/1Password/1password`。在应用的「设置 → 安全」中开启「使用系统验证服务解锁」。手动锁定后重新打开，验证系统密码可以解锁。[系统认证说明](https://support.1password.com/system-authentication-linux/)

若要在登录 GNOME 后静默启动，在仓库根目录以桌面用户执行：

```sh
install -Dm644 arch/1password/1password.desktop "${XDG_CONFIG_HOME:-$HOME/.config}/autostart/1password.desktop"
```

在应用中启用「在系统托盘中保留 1Password」。已验证的个人配置还关闭了「在电脑锁定时也锁定 1Password」并使用 24 小时闲置锁定；采用这些设置时，桌面锁屏可保留密码库会话。锁定策略由账户持有人选择。应用退出或平板重启后，首次解锁需要账户密码。需要代理时在本地配置网络。

Install the official ARM64 desktop app with system integration, enable system authentication in its security settings and optionally install the GNOME autostart entry above as your desktop user. Quitting the app or rebooting requires the account password on the next unlock.
