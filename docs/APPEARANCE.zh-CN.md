# 可选玻璃外观

这套外观用于 GNOME Shell 51，组合 Lintel 改版、Glasslight 改版、Blur my Shell 77 与洱海桌面动效。内核、设备支持包和 Android 双系统可以独立使用。所有命令在已安装 GNOME 的 Linux 用户环境执行；不要以 root 身份安装用户扩展或修改用户设置。

## 改造内容与参数

- [Lintel](https://github.com/ErikaAlk/lintel)：菜单栏、应用菜单、触控控制中心、日历通知、实时充电显示。
- [Glasslight](https://github.com/ErikaAlk/glasslight)：启动台、文件夹、长按拖动、搜索、键盘整理和中文输入法配合。
- [`erhai-motion`](../arch/appearance/erhai-motion/)：实时 GPU 背景捕获、连续圆角、GLSL 折射、动态明暗采样、菜单和窗口动效。
- [Blur my Shell](https://github.com/aunetx/blur-my-shell)：固定 `b1e415cc5ff3dffef72a69b552d8c64ae7d28a45`，提供共享管线与弹出层材质接口。

两个改版保留原 UUID：`lintel@topbar` 与 `glasslight`，会接替同 UUID 的用户安装。安装脚本先将原有用户扩展移到独立备份目录；系统目录中的扩展文件保持原状。新组件安装到用户扩展目录，四个共享组件放在同一层，以满足相对导入关系。

精调参数保存在代码和配置中，随本仓库完整固定：

| 内容 | 参数与来源 |
|---|---|
| 共享材质覆盖 | 饱和度 `1.05`、折射模糊半径 `14`、色散 `0.03`、高光 `0.10`、噪点 `0.025`；见 `erhai-motion/extension.js` |
| 连续圆角 | 平滑度 `0.6`，figma-squircle `1.1.0` 与 `smoothGeometry.glsl` |
| 完整折射 | `shaders/refraction.glsl`，保留原有边缘、高光、色散和裁切计算 |
| 文字与底色 | `erhai-motion/stylesheet.css`、各改版样式与动态明暗采样实现 |
| 桌面管线 | [`original-desktop.gschema.override`](../arch/appearance/original-desktop.gschema.override)，保留全部原始配置作为来源；加载程序选取其中的 Blur my Shell 项目 |
| 窗口模糊 | 原始配置的半径 `50`、亮度 `1.0`，保留应用排除列表 |
| 加载顺序 | Blur my Shell → Lintel → erhai-motion → Glasslight |

原始管线中的饱和度 `1.1`、噪点 `0.1` 用于管线基础配置；洱海指定的表面通过共享代码应用上述精调值。全部数值和着色器共同决定结果。

## 安装玻璃组件

Arch / Arch Linux ARM 需要以下构建与运行依赖。Lintel 即使没有启用天气组件，也会静态导入天气与定位模块，因此仍需对应 typelib。

```sh
sudo pacman -S --needed gnome-shell gjs glib2 gettext zip unzip git python python-pip python-numpy python-scipy python-svgwrite potrace npm make libgweather-4 geoclue libsoup3 networkmanager
```

从本仓库根目录执行，输出目录需要尚不存在：

```sh
bash arch/appearance/build.sh "$PWD/out/appearance"
bash arch/appearance/install.sh "$PWD/out/appearance"
gjs -m arch/appearance/configure.js enable
```

构建入口按 [`sources.sh`](../arch/appearance/sources.sh) 的提交取得两个 fork，通过固定 npm integrity 取得连续圆角依赖，并构建四个扩展。Lintel 图标由构建程序从 Apple 官方地址取得、逐项核验 SHA256 后在本机构建，下载或校验失败立即终止。字体与 Apple 资源原件不随本仓库发布。

安装不会自动启用扩展。`enable` 保存将要修改的设置和相关扩展状态，再应用原始玻璃配置与加载顺序。它保留壁纸、收藏应用、文件夹、字体和无关扩展设置。状态保存在 `${XDG_STATE_HOME:-~/.local/state}/erhai-appearance/`。

执行完后退出 GNOME，再重新登录，使新的 ES 模块完整加载。查看状态：

```sh
gnome-extensions info blur-my-shell@aunetx
gnome-extensions info lintel@topbar
gnome-extensions info erhai-motion@erhai.local
gnome-extensions info glasslight
```

四个扩展应处于 ACTIVE 状态。`Super+A` 打开应用目录，`Ctrl+Alt+Space` 打开搜索。长按应用后拖动可创建文件夹；`F2` 进入名称编辑，回车保存，`Esc` 逐层退出。

恢复启用前的参数和相关扩展状态，然后重新登录：

```sh
gjs -m arch/appearance/configure.js disable
```

已安装文件继续保留，原有用户扩展文件位于安装命令输出的 `files-*` 目录。更新前先停用，使用新的输出目录构建，再安装和启用。不要在 GNOME 的扩展商店自动更新这四个固定版本组件。

## 加载 MacTahoe 与底部 Dock

需要完整深色外观时，再安装本仓库固定的主题、图标和 Dock 软件包。依次进入下列三个目录，以普通用户执行 `makepkg -si`；构建依赖由 makepkg 提示安装：

- `arch/appearance/mactahoe-gtk-theme/`
- `arch/appearance/mactahoe-icon-theme/`
- `arch/appearance/gnome-shell-extension-dash-to-dock/`

同时安装提供 User Themes 的 GNOME 官方扩展包：

```sh
sudo pacman -S --needed base-devel gnome-shell-extensions
```

首次启用时将主题选项一并传入。已经启用玻璃组件时，先运行上节的 `disable` 再执行：

```sh
gjs -m arch/appearance/configure.js enable "$HOME/.local/share/gnome-shell/extensions" --theme
bash arch/appearance/gtk4.sh enable
```

使用自定义 `XDG_DATA_HOME` 时，将上面扩展目录替换为该目录下的 `gnome-shell/extensions`。主题选项加载深色 MacTahoe GTK/Shell、图标和光标，窗口按钮放在左侧，并恢复原有底部常驻 Dock 配置。`gtk4.sh` 单独保存原有 `gtk.css`，为 libadwaita 应用导入相同深色主题；重新打开应用生效。

完整停用：

```sh
bash arch/appearance/gtk4.sh disable
gjs -m arch/appearance/configure.js disable
```

GTK4 脚本将停用时的样式保存在状态目录中，再恢复原先的文件或符号链接。主题和图标软件包继续保留。

本机使用的字体是 OPPO Sans 4.0 Bold，终端使用 Adwaita Mono。OPPO Sans 请从 [OPPO 官方字体说明](https://open.oppomobile.com/new/developmentDoc/info?id=13223) 获取并按其许可安装；本组件保留用户当前字体设置。原始字体配置可参考 `original-desktop.gschema.override`。本机个人壁纸也由用户单独选择。

## 输入法与验证范围

Glasslight 附带两个针对本项目 kimpanel 的补丁：`kimpanel-shell-entry.patch`、`kimpanel-candidate-touch.patch`。使用 kimpanel 时须先核实其版本和补丁上下文，将补丁应用到该扩展的 `panel.js`；其他输入法配置无需应用。公开安装脚本不修改已有输入法文件。

两个改版的既有源码曾在平板 GNOME 51.1 日常会话中验证菜单、控制中心、媒体操作、启动台、文件夹、中文输入与触控。屏幕阅读器、系统字体缩放与全部主题组合尚未验证。

2026-11-02 的公开入口验证包括：从远端固定提交完整构建四个组件；使用真实 GSettings 保存和恢复玻璃参数；启用完整主题后执行普通停用；恢复原有 GTK4 符号链接；重复安装时分别保存原有文件。WSL x86_64、GNOME Shell 51.1、Mesa llvmpipe 的中英文隔离会话中，控制中心和启动台完成真实绘制，五项精调材质参数与连续圆角归属逐项通过，关闭启动台后模态输入释放，四个扩展依次停用。没有重新操作平板。

许可证：Lintel 保留 GPL-2.0-or-later 与 TPCT 的 GPL-3.0-or-later 来源；Glasslight 和共享玻璃实现按各自 GPL-3.0 声明分发；figma-squircle 为 MIT。主题与图标沿用各软件包内许可证，详见各 fork README 和源码声明。
