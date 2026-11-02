#!/bin/bash
set -euo pipefail
bundle=${1:?需要构建产物的绝对目录}
[[ "$bundle" = /* ]]
test "$(id -u)" -ne 0
destination="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions"
state="${XDG_STATE_HOME:-$HOME/.local/state}/erhai-appearance"
uuids=(blur-my-shell@aunetx lintel@topbar erhai-motion@erhai.local glasslight)
for uuid in "${uuids[@]}"; do
    test -f "$bundle/extensions/$uuid/metadata.json"
done
gjs -m "$(dirname -- "$0")/configure.js" check "$bundle/extensions"
install -d "$destination"
install -d -m 700 "$state"
backup=$(mktemp -d "$state/files-XXXXXXXXXX")
for uuid in "${uuids[@]}"; do
    if [ -e "$destination/$uuid" ]; then
        mv "$destination/$uuid" "$backup/$uuid"
    fi
    cp -r "$bundle/extensions/$uuid" "$destination/$uuid"
done
echo "扩展已安装，原有用户扩展保存在 $backup；尚未启用。"
