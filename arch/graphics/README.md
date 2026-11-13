# Arch与Android图形构建

`build.py`从当前公开仓库的`packaging/mesa/shared/mesa/source.json`与`packaging/iris-vaapi/source.json`读取固定源码、校验值和补丁顺序。Mesa构建包含Freedreno Gallium、Turnip、EGL、GLX、GBM和Vulkan设备选择层，宿主使用libglvnd；Iris包含编码、GPU复制和RGB→NV12 VPP。

需要AArch64 GNU交叉编译器、QEMU用户态模拟器、Meson、Ninja、pkg-config、Python、patch、tar、zstd，以及Mesa生成工具与Python构建依赖。宿主sysroot须提供AArch64图形开发库和pkg-config文件。Android构建另需NDK与完整Android33开发依赖目录，目录中包含`include`、`lib64`、`lib64/pkgconfig`。依赖库必须使用目标架构。

在Linux构建主机执行，路径均由参数提供；输出目录必须全新：

```bash
python arch/graphics/build.py --repo "$PWD" --sysroot /path/to/arch-aarch64-root --cache /path/to/source-cache --output /path/to/graphics-output --jobs 2 --android --ndk /path/to/android-ndk-r28b --android-deps /path/to/android-deps
```

不需要Android产物时省略`--android`、`--ndk`及`--android-deps`。源码已缓存时不会下载；归档与Mesa补丁必须通过固定SHA256检查。修改通过正常patch应用，构建遇到失败直接终止。

`host-install`、`iris-install`和`android-install`分别保存隔离安装产物。Android HAL为`vendor/lib64/hw/vulkan.freedreno.so`，与EGL/GLES/GBM及Gallium一起作为整组更新。

## 离线包装

从完成构建的stage生成可复现归档：

```bash
bash arch/graphics/prepare-package.sh /path/to/graphics-output "$PWD" /path/to/archives
bash arch/graphics/package.sh /path/to/archives /path/to/packages
python arch/graphics/verify-packages.py --packages /path/to/packages --sysroot /path/to/arch-aarch64-root --stage /path/to/graphics-output
```

`prepare-package.sh`需要stage中存在Android产物，生成Arch包装输入及Android整组overlay，归档统一文件顺序、时间戳、用户与组。静态PKGBUILD锁定此次已验证归档SHA256；重新构建产生不同归档时，核验来源与内容后同步维护SHA256。

`package.sh`用独立makepkg配置将目标架构设为aarch64，在交叉宿主上执行`makepkg --nodeps`离线包装。此操作检查归档和包内容，目标依赖需在实际Arch系统安装时验收。

包归属：`mesa`提供宿主GL、GBM及DRI；`vulkan-freedreno`提供Turnip与ICD；`vulkan-mesa-implicit-layers`提供设备选择层；`libva-iris-erhai`提供Iris与MSM VA-API入口。Mesa保留GBM后端及libglvnd依赖，文件清单没有libglvnd所属库或头文件。此次构建只包含Freedreno，不声明其他GPU或软件渲染驱动；安装操作无需卸载其他独立显卡驱动包。

验证工具检查四包目标架构、文件归属互斥、libglvnd冲突、GBM后端与MSM入口，以及库内容与stage一致性。GPU运行、视频编解码、VPP和Waydroid仍须在设备验收。
