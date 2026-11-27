import gi

gi.require_version('Gio', '2.0')
from gi.repository import Gio


shell = Gio.Settings.new('org.gnome.shell')
uuid = 'erhai-unlock@erhai.local'
enabled = list(shell.get_strv('enabled-extensions'))
if uuid not in enabled:
    enabled.append(uuid)
if not shell.set_strv('enabled-extensions', enabled):
    raise SystemExit('无法保存锁屏扩展设置。')
disabled = [entry for entry in shell.get_strv('disabled-extensions') if entry != uuid]
if not shell.set_strv('disabled-extensions', disabled):
    raise SystemExit('无法保存扩展启用状态。')
desktop = Gio.Settings.new('org.gnome.desktop.interface')
if not desktop.set_boolean('enable-animations', True):
    raise SystemExit('无法启用桌面动画。')
Gio.Settings.sync()
print('锁屏扩展与桌面动画已加入当前用户设置，下次登录加载。')
