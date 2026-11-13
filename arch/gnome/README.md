# GNOME 51.1 平板电源修复

本目录包含 Arch Linux ARM 的三个同名升级包配方、已验证补丁与交叉构建入口。升级版本为 `51.1-1.1`，保留官方包的全部文件、依赖、备份路径和软件包归属；只替换 Mutter 库、两个 GSD 程序、控制中心程序及两份 GSD schema。

## 源码准备

源码缓存中保存 GNOME 官方 `51.1` 压缩包及对应的已准备源码目录：

- `mutter-51.1.tar.xz` 与 `mutter-51.1/`
- `gnome-settings-daemon-51.1.tar.xz` 与 `gnome-settings-daemon-51.1/`
- `gnome-control-center-51.1.tar.xz` 与 `gnome-control-center-51.1/`

下载位置为 `https://download.gnome.org/sources/<组件>/51/`，原始压缩包哈希固定在 `SOURCE_SHA256SUMS`。在各源码目录应用对应补丁：GSD 使用 `gsd-51.1-power-lock-ambient.patch`；控制中心使用 `gcc-51.1-power-lock.patch`；Mutter 使用三个 `mutter-51.1-*.patch`。源码准备使用文件编辑工具；构建入口只读取源码，不自动改写源文件。

`verify-sources.py` 读取八个修改后源文件并统一换行后计算哈希，检查它们与已验证内容一致；不会写入或转换源文件。其他源码文件应保持官方压缩包内容。

## 交叉构建

需要 ARM64 Arch 根系统及相应开发依赖，宿主具备 `aarch64-linux-gnu-gcc`、`meson`、`ninja`、`pkg-config`、`qemu-aarch64-static`、`blueprint-compiler`、`gettext`、`python` 与通常的 GNOME 构建工具。构建路径放在 Linux 原生文件系统。

```sh
bash build-gnome.sh /绝对路径/arm64-root /绝对路径/source-cache /绝对路径/output
```

可通过 `GNOME_BUILD_JOBS` 调整并行数量，默认六个任务。脚本按 Mutter、GSD、控制中心顺序构建；控制中心引用本次构建的 GSD 枚举头文件。目标根保持不变，交叉配置通过输出目录内的符号链接读取它。

输出包含 `gnome-51.1-power-fixes-aarch64.tar.xz` 和 `PAYLOAD_SHA256SUMS`。脚本用目标 ARM64 `glib-compile-schemas --strict` 验证现有全部 schema 与新 schema 的组合。

完整 `stage-*` 只用于提取六个目标文件。禁止把整个 GSD 暂存目录安装到系统：其 systemd 和 udev 路径可能包含交叉根目录前缀。

## 制作升级包

原包缓存保存以下三个官方包及其 `.sig`：

`http://mirror.archlinuxarm.org/aarch64/extra/<组件>-51.1-1-aarch64.pkg.tar.xz`

使用可信的 Arch Linux ARM 公钥验证签名，再执行：

```sh
bash build-packages.sh /绝对路径/original-packages /绝对路径/gnome-51.1-power-fixes-aarch64.tar.xz /绝对路径/package-output
```

脚本执行 `makepkg --nodeps`，目标架构为 `aarch64`。`sha256sums` 固定官方原包和已经验证的六件修复归档；重新构建得到不同归档时，必须重新验证产物并更新三个 PKGBUILD 中的归档哈希。打包步骤不连接设备或安装软件包。

升级时应同时安装三个包，随后执行系统 schema 严格编译并重新启动 GNOME 会话。电源按钮默认动作仍由集成配置设置；设置为 `lock` 后才能启用本次锁屏行为。Mutter 继续提供 `libmutter-51.so=0-64`，官方 introspection、私有辅助库、服务文件及资源均保留。

## 验证范围

已验证六件产物的 ARM64 架构、目标动态库解析、GSD 帮助入口、控制中心版本入口、schema 严格编译、Mutter 动态符号兼容性及全部原包文件保留情况。动态符号检查不等同于完整结构体布局 ABI 分析。设备电源按钮、唤醒、照度变化及注销资源回收仍需要真机验收。
