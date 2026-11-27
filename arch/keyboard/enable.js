import Gio from 'gi://Gio';
const uuid = 'erhai-keyboard@erhai.local';
const shell = new Gio.Settings({schema_id: 'org.gnome.shell'});
shell.set_strv('enabled-extensions', [...new Set([...shell.get_strv('enabled-extensions'), uuid])]);
shell.set_strv('disabled-extensions', shell.get_strv('disabled-extensions').filter(value => value !== uuid));
new Gio.Settings({schema_id: 'org.gnome.desktop.interface'}).set_boolean('toolkit-accessibility', true);
new Gio.Settings({schema_id: 'org.gnome.desktop.a11y.applications'}).set_boolean('screen-keyboard-enabled', false);
Gio.Settings.sync();
