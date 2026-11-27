#!/bin/bash
set -eu
root=$(realpath -m "${1:-/}")
cd "$(dirname "$(realpath "$0")")"
extension="$root/usr/share/gnome-shell/extensions/erhai-keyboard@erhai.local"
install -Dm644 -t "$extension" metadata.json extension.js inputFocus.js oskController.js
install -Dm644 icons/keyboard-symbolic.svg "$extension/icons/keyboard-symbolic.svg"
install -Dm644 input-focus-service.py "$root/usr/local/share/erhai/input-focus-service.py"
install -Dm644 erhai-input-focus.service "$root/usr/lib/systemd/user/erhai-input-focus.service"
install -Dm644 org.erhai.InputFocus1.service "$root/usr/share/dbus-1/services/org.erhai.InputFocus1.service"
