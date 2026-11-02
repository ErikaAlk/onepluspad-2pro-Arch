#!/bin/bash
set -euo pipefail
action=${1:?用法：gtk4.sh enable 或 disable}
test "$(id -u)" -ne 0
source=$(cd -- "$(dirname -- "$0")" && pwd)
config="${XDG_CONFIG_HOME:-$HOME/.config}/gtk-4.0"
state="${XDG_STATE_HOME:-$HOME/.local/state}/erhai-appearance/gtk4"
case "$action" in
    enable)
        test -f /usr/share/mactahoe-gtk-theme/libadwaita/gtk-Dark.css
        test ! -e "$state/active"
        install -d "$config"
        install -d -m 700 "$state"
        if [ -e "$config/gtk.css" ] || [ -L "$config/gtk.css" ]; then
            test ! -e "$state/previous.css"
            test ! -L "$state/previous.css"
            mv "$config/gtk.css" "$state/previous.css"
        fi
        touch "$state/active"
        install -m 644 "$source/gtk.css" "$config/gtk.css"
        ;;
    disable)
        test -f "$state/active"
        if [ -e "$config/gtk.css" ] || [ -L "$config/gtk.css" ]; then
            disabled=$(mktemp -d "$state/disabled-XXXXXXXXXX")
            mv "$config/gtk.css" "$disabled/gtk.css"
        fi
        if [ -e "$state/previous.css" ] || [ -L "$state/previous.css" ]; then
            mv "$state/previous.css" "$config/gtk.css"
        fi
        mv "$state/active" "$state/inactive"
        ;;
    *) echo '操作必须为 enable 或 disable' >&2; exit 1 ;;
esac
echo 'GTK4 外观设置已更新；请重新打开应用。'
