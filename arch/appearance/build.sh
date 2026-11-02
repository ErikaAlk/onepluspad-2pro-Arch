#!/bin/bash
set -euo pipefail
source=$(cd -- "$(dirname -- "$0")" && pwd)
output=${1:?需要新的绝对输出目录}
[[ "$output" = /* ]]
test ! -e "$output"
install -d "$output/sources" "$output/extensions"
fetch_source() {
    local name=$1 url=$2 revision=$3
    git init -q "$output/sources/$name"
    git -C "$output/sources/$name" fetch --depth 1 "$url" "$revision"
    git -C "$output/sources/$name" switch --detach FETCH_HEAD
    test "$(git -C "$output/sources/$name" rev-parse HEAD)" = "$revision"
}
# 固定源码由同目录 sources.sh 记录。
source "$source/sources.sh"
fetch_source lintel https://github.com/ErikaAlk/lintel.git "$lintel_revision"
fetch_source glasslight https://github.com/ErikaAlk/glasslight.git "$glasslight_revision"
fetch_source blur-my-shell https://github.com/aunetx/blur-my-shell.git b1e415cc5ff3dffef72a69b552d8c64ae7d28a45
python -m venv --system-site-packages "$output/python"
"$output/python/bin/pip" install -r "$output/sources/lintel/tools/erhai-requirements.txt"
export PYTHON="$output/python/bin/python"
bash "$output/sources/lintel/tools/package-erhai.sh" "$output/lintel-package"
bash "$output/sources/glasslight/package-erhai.sh" "$output/glasslight-package"
make -C "$output/sources/blur-my-shell" build
for uuid in lintel@topbar glasslight blur-my-shell@aunetx; do
    install -d "$output/extensions/$uuid"
done
unzip -q "$output/lintel-package/lintel-erhai.shell-extension.zip" -d "$output/extensions/lintel@topbar"
unzip -q "$output/glasslight-package/glasslight-erhai.shell-extension.zip" -d "$output/extensions/glasslight"
unzip -q "$output/sources/blur-my-shell/build/blur-my-shell@aunetx.shell-extension.zip" -d "$output/extensions/blur-my-shell@aunetx"
glib-compile-schemas --strict "$output/extensions/blur-my-shell@aunetx/schemas"
cp -r "$source/erhai-motion" "$output/extensions/erhai-motion@erhai.local"
install -d "$output/shape"
cp "$source/"{package.json,package-lock.json} "$output/shape/"
npm ci --ignore-scripts --prefix "$output/shape"
install -d "$output/extensions/erhai-motion@erhai.local/shape"
cp "$output/shape/node_modules/figma-squircle/dist/index.js" "$output/extensions/erhai-motion@erhai.local/shape/"
cp "$output/shape/node_modules/figma-squircle/LICENSE" "$output/extensions/erhai-motion@erhai.local/shape/"
gjs -m "$source/configure.js" check "$output/extensions"
echo "APPEARANCE_BUILD_PASSED $output"
