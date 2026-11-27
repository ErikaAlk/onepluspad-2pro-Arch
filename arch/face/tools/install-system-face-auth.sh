#!/bin/bash
set -euo pipefail
project=$(cd -- "$(dirname -- "$0")/.." && pwd)
test "$(id -u)" -eq 0
test "$(uname -m)" = aarch64
test "$(gnome-shell --version)" = 'GNOME Shell 51.1'
test "$(pacman -Q polkit)" = 'polkit 128-1'
test -f /usr/lib/security/pam_howdy.so
FACE_USER=$(id -nu 1000)
[[ $FACE_USER =~ ^[a-z_][a-z0-9_-]*$ ]]
export FACE_USER
test "$(stat -c '%U:%a' "/var/lib/howdy/models/$FACE_USER.dat")" = root:600
backup=/var/lib/erhai/system-face-auth
output=/var/cache/erhai/system-face-auth
install -d -m 700 "$backup" "$output"
install -d -o root -g root -m 700 /run/erhai-face
install -d -m 755 /run/faillock
cd /
sha256sum --check "$project/config/system-face-auth-baseline.sha256"

# 只接受已经核对的供应商配置，避免覆盖设备上另外配置的认证限制。
for name in sudo su su-l login polkit-1; do
    source=/etc/pam.d/$name
    test -e "$source" || source=/usr/lib/pam.d/$name
    case "$name" in
        sudo) expected=7ec1c668c10e0f83d00e25f336872212fe04ce2c2563e1d661d34d28852f4649; template=sudo ;;
        su|su-l) expected=5f4d36be03cc980930ba0a0e109d6b5625201f88a4ae7f913d632f5ab5866b87; template=su ;;
        login) expected=ee917d55042f78b8bb03f5467e5233e3e2ddc2fe01e302bc53b218003fe22275; template=login ;;
        polkit-1) expected=a4454c54582a86fd4560321b22ffb7639485968438a07d5412fadc102d62cf49; template=polkit-1 ;;
    esac
    actual=$(sha256sum "$source")
    if ! cmp -s "$source" "$project/config/system-face-pam/$template"; then
        test "${actual%% *}" = "$expected"
    fi
    if [ ! -e "$backup/$name" ]; then
        install -m 600 "$source" "$backup/$name"
    fi
done
if [ -e /etc/pam.d/sudo-i ]; then
    cmp /etc/pam.d/sudo-i "$project/config/system-face-pam/sudo"
fi
test ! -e /usr/lib/pam.d/sudo-i

bash "$project/tools/build-system-face-auth.sh" "$output"
install -D -m 755 "$output/broker" /usr/lib/erhai-face/broker
install -m 755 "$output/pam_erhai_face.so" /usr/lib/security/pam_erhai_face.so
install -m 644 "$project/config/erhai-face-backend.pam" /etc/pam.d/erhai-face-backend
install -m 644 "$project/config/erhai-face.socket" /etc/systemd/system/erhai-face.socket
install -m 644 "$project/config/erhai-face@.service" /etc/systemd/system/erhai-face@.service
install -D -m 644 "$project/config/polkit-face-faillock.conf" \
    /etc/systemd/system/polkit-agent-helper@.service.d/60-erhai-faillock.conf
envsubst '${FACE_USER}' < "$project/config/org.erhai.FaceAuthentication.conf" > "$output/dbus.conf"
install -D -m 644 "$output/dbus.conf" \
    /etc/dbus-1/system.d/org.erhai.FaceAuthentication.conf
systemctl reload dbus
systemctl daemon-reload
systemctl enable --now erhai-face.socket
systemctl is-active --quiet erhai-face.socket
envsubst '${FACE_USER}' < "$project/config/sudo-face-auth.conf" > "$output/sudo.conf"
visudo -cf "$output/sudo.conf"
if [ -e /etc/sudoers.d/20-erhai-face-auth ] && [ ! -e "$backup/sudo-face-auth.conf" ]; then
    install -m 600 /etc/sudoers.d/20-erhai-face-auth "$backup/sudo-face-auth.conf"
fi
install -m 440 "$output/sudo.conf" /etc/sudoers.d/20-erhai-face-auth.pending
mv -T /etc/sudoers.d/20-erhai-face-auth.pending /etc/sudoers.d/20-erhai-face-auth
visudo -c
for name in sudo sudo-i su su-l login polkit-1; do
    template=$name
    if [ "$name" = su-l ]; then template=su; fi
    if [ "$name" = sudo-i ]; then template=sudo; fi
    install -m 644 "$project/config/system-face-pam/$template" "/etc/pam.d/$name.erhai-pending"
    mv -T "/etc/pam.d/$name.erhai-pending" "/etc/pam.d/$name"
done
printf '%s\n' '系统面容认证候选已安装，真实面容、原密码和取消行为仍须设备验收。'
