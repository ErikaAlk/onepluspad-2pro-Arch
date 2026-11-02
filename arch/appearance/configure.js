import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const action = ARGV[0];
if (!['check', 'enable', 'disable'].includes(action))
    throw new Error('用法：gjs -m configure.js check|enable|disable 扩展目录');
const extensionDirectory = ARGV[1] ?? GLib.build_filenamev([GLib.get_user_data_dir(), 'gnome-shell', 'extensions']);
const directory = Gio.File.new_for_uri(import.meta.url).get_parent();
const root = directory.get_path();
const uuids = ['blur-my-shell@aunetx', 'lintel@topbar', 'erhai-motion@erhai.local', 'glasslight'];
let source = Gio.SettingsSchemaSource.get_default();
for (const uuid of uuids.filter(uuid => uuid !== 'erhai-motion@erhai.local'))
    source = Gio.SettingsSchemaSource.new_from_directory(
        GLib.build_filenamev([extensionDirectory, uuid, 'schemas']), source, false);
for (const uuid of ['user-theme@gnome-shell-extensions.gcampax.github.com', 'dash-to-dock@micxgx.gmail.com']) {
    for (const base of ['/usr/share/gnome-shell/extensions', extensionDirectory]) {
        const path = GLib.build_filenamev([base, uuid, 'schemas']);
        if (GLib.file_test(`${path}/gschemas.compiled`, GLib.FileTest.EXISTS))
            source = Gio.SettingsSchemaSource.new_from_directory(path, source, false);
    }
}
const settingsFor = id => {
    const schema = source.lookup(id, true);
    if (!schema)
        throw new Error(`缺少设置定义：${id}`);
    return new Gio.Settings({settings_schema: schema});
};
const shell = settingsFor('org.gnome.shell');
const profile = new GLib.KeyFile();
profile.load_from_file(`${root}/original-desktop.gschema.override`, GLib.KeyFileFlags.NONE);
const entries = [];
const theme = ARGV.includes('--theme');
if (theme)
    uuids.unshift('user-theme@gnome-shell-extensions.gcampax.github.com', 'dash-to-dock@micxgx.gmail.com');
if (theme) {
    for (const path of ['/usr/share/themes/MacTahoe-Dark', '/usr/share/icons/MacTahoe-dark', '/usr/share/icons/MacTahoe']) {
        if (!GLib.file_test(path, GLib.FileTest.IS_DIR))
            throw new Error(`请先安装外观资源：${path}`);
    }
}
for (const group of profile.get_groups()[0]) {
    const glassGroup = group.startsWith('org.gnome.shell.extensions.blur-my-shell');
    const themeGroup = theme && ['org.gnome.shell.extensions.dash-to-dock',
        'org.gnome.shell.extensions.user-theme', 'org.gnome.desktop.interface',
        'org.gnome.desktop.wm.preferences'].includes(group);
    if (!glassGroup && !themeGroup)
        continue;
    const settings = settingsFor(group);
    for (const key of profile.get_keys(group)[0]) {
        if (group === 'org.gnome.desktop.interface' &&
            !['color-scheme', 'gtk-theme', 'icon-theme', 'cursor-theme', 'enable-animations'].includes(key))
            continue;
        if (group === 'org.gnome.desktop.wm.preferences' && key !== 'button-layout')
            continue;
        const schemaKey = settings.settings_schema.get_key(key);
        const value = GLib.Variant.parse(schemaKey.get_value_type(), profile.get_value(group, key), null, null);
        if (!schemaKey.range_check(value))
            throw new Error(`参数超出范围：${group}/${key}`);
        entries.push({id: group, key, settings, value});
    }
}
for (const [id, key, text] of [
    ['org.gnome.shell.extensions.glasslight', 'replace-app-grid', 'true'],
    ['org.gnome.shell.extensions.lintel', 'control-center-controls', "['wifi', 'network', 'media', 'bluetooth', 'airdrop', 'focus', 'stage-manager', 'screen-mirroring', 'display', 'sound', 'dark-mode', 'screenshot']"],
    ['org.gnome.shell.extensions.lintel', 'control-center-control-sizes', "{'wifi': 'wide', 'network': 'wide', 'bluetooth': 'small', 'airdrop': 'small', 'focus': 'wide', 'stage-manager': 'small', 'screen-mirroring': 'small'}"],
    ['org.gnome.shell.extensions.lintel', 'notification-center-widgets', "['calendar']"],
]) {
    const settings = settingsFor(id);
    const value = GLib.Variant.parse(settings.settings_schema.get_key(key).get_value_type(), text, null, null);
    entries.push({id, key, settings, value});
}
const stateDirectory = GLib.build_filenamev([GLib.get_user_state_dir(), 'erhai-appearance']);
const statePath = `${stateDirectory}/settings.json`;
const stateFile = Gio.File.new_for_path(statePath);
if (action === 'check') {
    print(`玻璃配置校验通过：${entries.length} 项；未修改用户设置`);
} else if (action === 'enable') {
    if (stateFile.query_exists(null))
        throw new Error('外观已经启用；请先停用，再重新启用');
    for (const entry of entries) {
        if (!entry.settings.is_writable(entry.key))
            throw new Error(`设置不可写：${entry.id}/${entry.key}`);
    }
    const snapshot = {
        entries: entries.map(({id, key, settings}) => ({id, key,
            value: settings.get_user_value(key)?.print(true) ?? null})),
        enabled: shell.get_strv('enabled-extensions'),
        disabled: shell.get_strv('disabled-extensions'),
        uuids,
    };
    GLib.mkdir_with_parents(stateDirectory, 0o700);
    GLib.file_set_contents(statePath, JSON.stringify(snapshot));
    for (const {id, key, settings, value} of entries) {
        if (!settings.set_value(key, value))
            throw new Error(`无法保存参数：${id}/${key}；请执行 disable 恢复`);
    }
    if (!shell.set_strv('disabled-extensions', snapshot.disabled.filter(uuid => !uuids.includes(uuid))) ||
        !shell.set_strv('enabled-extensions', [...snapshot.enabled.filter(uuid => !uuids.includes(uuid)), ...uuids]))
        throw new Error('无法保存扩展加载顺序；请执行 disable 恢复');
    Gio.Settings.sync();
    print('玻璃外观已配置；请退出 GNOME 后重新登录');
} else {
    const [, bytes] = stateFile.load_contents(null);
    const snapshot = JSON.parse(new TextDecoder().decode(bytes));
    for (const {id, key, value} of snapshot.entries) {
        const settings = settingsFor(id);
        if (value === null)
            settings.reset(key);
        else if (!settings.set_value(key, GLib.Variant.parse(
            settings.settings_schema.get_key(key).get_value_type(), value, null, null)))
            throw new Error(`无法恢复参数：${id}/${key}`);
    }
    // 只恢复本外观涉及的扩展，保留使用期间增删的其他扩展。
    for (const [key, previous] of [['enabled-extensions', snapshot.enabled], ['disabled-extensions', snapshot.disabled]]) {
        const current = shell.get_strv(key).filter(uuid => !snapshot.uuids.includes(uuid));
        if (!shell.set_strv(key, [...current, ...previous.filter(uuid => snapshot.uuids.includes(uuid))]))
            throw new Error(`无法恢复扩展设置：${key}`);
    }
    Gio.Settings.sync();
    stateFile.delete(null);
    print('原有玻璃参数与扩展启用状态已恢复；请退出 GNOME 后重新登录');
}
