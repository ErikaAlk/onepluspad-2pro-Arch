import argparse
import hashlib
import json
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('cache', type=Path)
parser.add_argument('--print', action='store_true', dest='print_hashes')
options = parser.parse_args()
names = (
    'gnome-settings-daemon-51.1/data/gnome-settings-daemon/gsd-enums.h',
    'gnome-settings-daemon-51.1/data/org.gnome.settings-daemon.plugins.power.gschema.xml.in',
    'gnome-settings-daemon-51.1/plugins/media-keys/gsd-media-keys-manager.c',
    'gnome-settings-daemon-51.1/plugins/power/gsd-power-manager.c',
    'gnome-control-center-51.1/panels/power/cc-power-panel.c',
    'mutter-51.1/meson.build',
    'mutter-51.1/src/x11/meta-x11-frame.c',
    'mutter-51.1/src/backends/native/meta-renderer-native.c',
)
# 通用换行读取只影响校验，不写入或转换源码。
actual = {name: hashlib.sha256((options.cache / name).read_text().encode()).hexdigest() for name in names}
if options.print_hashes:
    print(json.dumps(actual, indent=2))
else:
    expected = json.loads(Path(__file__).with_name('prepared-sources.json').read_text())
    assert actual == expected, '准备后的源码与已验证版本不一致'
    print('八个修改后源文件的内容校验通过。')
