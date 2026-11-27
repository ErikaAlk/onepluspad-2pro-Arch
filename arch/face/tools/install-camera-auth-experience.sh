#!/bin/bash
set -euo pipefail

test "$(id -u)" -eq 0
test "$(uname -m)" = aarch64
project=$(cd -- "$(dirname -- "$0")/.." && pwd)
mesa_package=$(pacman -Q mesa)
case "$mesa_package" in
    'mesa 1:26.2.6-1.1'|'mesa 1:26.2.6-1.2'|'mesa 1:26.2.6-1.3') ;;
    *) printf '%s\n' '当前Mesa版本未经本项目核验，停止安装。' >&2; exit 1 ;;
esac
test "$(gnome-shell --version)" = 'GNOME Shell 51.1'
test -r /etc/howdy/config.ini
test -f /usr/lib/security/pam_howdy.so
face_user=$(id -nu 1000)
test "$(stat -c '%U:%a' "/var/lib/howdy/models/$face_user.dat")" = root:600
test -S /run/user/1000/bus
case "$(pacman -Q libcamera)" in
    'libcamera 0.7.2-4.2') camera_version=0.7.2-4.2 ;;
    'libcamera 0.7.2-4.3') camera_version=0.7.2-4.3 ;;
    *) printf '%s\n' '当前libcamera版本未经本项目核验，停止安装。' >&2; exit 1 ;;
esac
for name in libcamera libcamera-ipa libcamera-tools gst-plugin-libcamera; do
    test "$(pacman -Q "$name")" = "$name $camera_version"
done

backup=/var/lib/erhai/camera-auth-experience
install -d -o root -g root -m 700 "$backup"
pacman -Sp --needed --print-format '%n' snapshot pipewire-libcamera gcc pkgconf >"$backup/package-plan.txt"
if grep -Ex 'mesa|libcamera|libcamera-base|libcamera-ipa|libcamera-tools|gst-plugin-libcamera' "$backup/package-plan.txt"; then
    printf '%s\n' '软件事务要求替换已经验证的图形或摄像头软件包，停止安装。' >&2
    exit 1
fi

pacman -S --needed --noconfirm snapshot pipewire-libcamera gcc pkgconf
test "$(pacman -Q mesa)" = "$mesa_package"
pacman -Q snapshot pipewire-libcamera libcamera howdy-erhai

extension=erhai-unlock@erhai.local
destination=/usr/share/gnome-shell/extensions/$extension
install -d -o root -g root -m 755 "$destination"
for name in extension.js faceIndicator.js faceIdAnimation.js systemAuthentication.js metadata.json stylesheet.css; do
    install -o root -g root -m 644 \
        "$project/config/gnome-shell/extensions/$extension/$name" "$destination/$name"
done

if [ ! -e "$backup/howdy.ini" ]; then
    install -o root -g root -m 600 /etc/howdy/config.ini "$backup/howdy.ini"
fi
python "$project/tools/configure-face-experience.py" --config /etc/howdy/config.ini
runuser -u "$face_user" -- env DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus \
    python "$project/tools/enable-unlock-experience.py"
desktop-file-validate /usr/share/applications/org.gnome.Snapshot.desktop
bash "$project/tools/install-system-face-auth.sh"
printf '%s\n' '相机与锁屏扩展已安装；会话加载、前后摄像头及真实认证仍须验证。'
