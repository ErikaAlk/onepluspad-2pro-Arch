#!/bin/bash
set -euo pipefail
cd "$(dirname "$(realpath "$0")")"
release=7.4.0-rc2-erhai-arch-v0122+
if [[ $EUID != 0 || $(uname -r) != "$release" ]] || ! grep -Fxqz 'oneplus,erhai' /proc/device-tree/compatible; then
    echo '请在运行匹配版本内核的一加平板 2 Pro 上使用 root 安装。' >&2
    exit 1
fi
for module in cps8601 nt36536_pen; do
    test "$(modinfo -F name "./$module.ko")" = "$module"
    version=$(modinfo -F vermagic "./$module.ko")
    test "${version%% *}" = "$release"
done
install -Dm644 -t "/usr/lib/modules/$release/updates" cps8601.ko nt36536_pen.ko
depmod "$release"
install -Dm755 enable-pen.sh /usr/local/libexec/erhai-pencil2pro
install -Dm644 80-erhai-pencil2pro.rules /etc/udev/rules.d/80-erhai-pencil2pro.rules
install -Dm644 erhai-pencil2pro.service /etc/systemd/system/erhai-pencil2pro.service
systemctl daemon-reload
udevadm control --reload
systemctl enable erhai-pencil2pro.service
echo '安装完成。请保存平板上的工作，重新启动 Arch 后吸附手写笔。'
