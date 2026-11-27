import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';
import {FacePopup} from './faceIndicator.js';

const reducedMotion = () => St.Settings.get().reduced_motion === St.ReducedMotion.REDUCE;

const AuthenticationDialog = GObject.registerClass(
class AuthenticationDialog extends ModalDialog.ModalDialog {
    _fadeOpen() {
        this._monitorConstraint.index = global.display.get_current_monitor();
        this._setState(ModalDialog.State.OPENING);
        this.dialogLayout.opacity = 255;
        this.opacity = 0;
        this._lightbox.lightOn();
        this.show();
        this.ease({opacity: 255, duration: reducedMotion() ? 0 : 320,
            mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
            onComplete: () => {
                this._setState(ModalDialog.State.OPENED);
                this.emit('opened');
            }});
    }

    close() {
        if ([ModalDialog.State.CLOSED, ModalDialog.State.CLOSING].includes(this.state))
            return;
        this.remove_all_transitions();
        this.dialogLayout.remove_all_transitions();
        this._setState(ModalDialog.State.CLOSING);
        this.popModal();
        this._savedKeyFocus = null;
        this.ease({opacity: 0, duration: reducedMotion() ? 0 : 240,
            mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
            onComplete: () => this._closeComplete()});
    }
});

const INTERFACE = `<node><interface name="org.erhai.FaceAuthentication">
<method name="Begin"><arg type="s" direction="in"/><arg type="s" direction="in"/>
<arg type="s" direction="in"/><arg type="b" direction="out"/></method>
<method name="Update"><arg type="s" direction="in"/><arg type="s" direction="in"/></method>
<method name="Check"><arg type="s" direction="in"/><arg type="b" direction="out"/></method>
</interface></node>`;

export class SystemAuthentication {
    constructor() {
        this._destroyed = false;
        this._connection = Gio.DBus.system;
        this._object = Gio.DBusExportedObject.wrapJSObject(INTERFACE, this);
        this._object.export(this._connection, '/org/erhai/FaceAuthentication');
        this._name = Gio.bus_own_name_on_connection(this._connection,
            'org.erhai.FaceAuthentication', Gio.BusNameOwnerFlags.NONE, null, () => this._close());
        Main.sessionMode.connectObject('updated', () => {
            if (Main.sessionMode.isLocked)
                this._close();
        }, this);
    }

    async _root(invocation) {
        const reply = await this._connection.call(
            'org.freedesktop.DBus', '/org/freedesktop/DBus', 'org.freedesktop.DBus',
            'GetConnectionUnixUser', new GLib.Variant('(s)', [invocation.get_sender()]),
            new GLib.VariantType('(u)'), Gio.DBusCallFlags.NONE, 2000, null);
        return reply.deepUnpack()[0] === 0;
    }

    async BeginAsync([token, service, user], invocation) {
        if (!await this._root(invocation) || this._destroyed || this._dialog || this._closingDialog || Main.sessionMode.isLocked ||
            user !== GLib.get_user_name() || !['sudo', 'sudo-i', 'su', 'su-l', 'polkit-1'].includes(service)) {
            invocation.return_value(new GLib.Variant('(b)', [false]));
            return;
        }
        const polkitDialog = service === 'polkit-1'
            ? Main.componentManager?._allComponents.polkitAgent?._currentDialog : null;
        if (service === 'polkit-1' && !polkitDialog) {
            invocation.return_value(new GLib.Variant('(b)', [false]));
            return;
        }
        this._token = token;
        this._sender = invocation.get_sender();
        this._pending = invocation;
        this._dialog = new AuthenticationDialog({styleClass: 'erhai-face-confirm'});
        this._dialog.dialogLayout._dialog.y_align = Clutter.ActorAlign.START;
        this._polkitDialog = polkitDialog;
        const originalClosed = () => {
            if (!this._polkitCompleted || this._indicator?.state !== 'success')
                this._close();
        };
        this._polkitCompleted = false;
        polkitDialog?.connectObject('done', (_dialog, dismissed) => {
            this._polkitCompleted = !dismissed;
            if (dismissed || this._indicator?.state !== 'success')
                this._close();
        }, 'closed', originalClosed, this);
        const popupLayer = new St.Widget({x_expand: true, y_expand: true});
        popupLayer.add_constraint(new Clutter.BindConstraint({
            source: this._dialog.backgroundStack, coordinate: Clutter.BindCoordinate.SIZE}));
        this._dialog.backgroundStack.add_child(popupLayer);
        this._popup = new FacePopup(popupLayer);
        this._indicator = this._popup.indicator;
        this._popup.reactive = true;
        this._popup.can_focus = true;
        this._popup.accessible_name = '取消面容识别并使用密码';
        this._popup.connect('clicked', () => this._close());
        // 成功动画播完、浮层收起后再关闭认证界面
        this._popup.connect('dismissed', () => this._close());
        const keys = new Clutter.KeyController();
        keys.connect('key-press', controller => {
            const [, symbol] = controller.get_key();
            if (symbol !== Clutter.KEY_Escape)
                return Clutter.EVENT_PROPAGATE;
            this._close();
            return Clutter.EVENT_STOP;
        });
        this._popup.add_action(keys);
        const title = new St.Label({text: '使用面容认证', x_align: Clutter.ActorAlign.CENTER});
        const description = new St.Label({
            text: polkitDialog?.message ?? `${service} 请求验证 ${user} 的身份`,
            x_align: Clutter.ActorAlign.CENTER,
            style_class: 'erhai-auth-description',
        });
        description.clutter_text.line_wrap = true;
        this._dialog.contentLayout.add_child(title);
        this._dialog.contentLayout.add_child(description);
        this._dialog.addButton({label: '使用密码', action: () => this._close(), key: Clutter.KEY_Escape});
        this._startButton = this._dialog.addButton({
            label: '使用面容',
            action: () => {
                this._startButton.reactive = false;
                this._pending.return_value(new GLib.Variant('(b)', [true]));
                this._pending = null;
            },
        });
        this._watch = Gio.bus_watch_name_on_connection(this._connection, this._sender,
            Gio.BusNameWatcherFlags.NONE, null, () => {
                if (this._indicator?.state !== 'success')
                    this._close();
            });
        this._timeout = GLib.timeout_add_once(GLib.PRIORITY_DEFAULT, 45000, () => {
            this._timeout = 0;
            this._close();
        });
        if (!this._dialog.open())
            this._close();
    }

    async UpdateAsync([token, state], invocation) {
        if (!await this._root(invocation) || this._destroyed || token !== this._token ||
            invocation.get_sender() !== this._sender || !this._dialog ||
            !['recognizing', 'password', 'success'].includes(state)) {
            invocation.return_dbus_error('org.erhai.FaceAuthentication.InvalidRequest', '认证请求已经结束');
            return;
        }
        if (state === 'recognizing') {
            const dialog = this._dialog;
            dialog.dialogLayout.ease({opacity: 0, duration: reducedMotion() ? 0 : 180,
                mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
                onComplete: () => {
                    if (this._dialog === dialog)
                        dialog.dialogLayout.hide();
                }});
            this._popup.setState(state);
            this._popup.grab_key_focus();
        } else {
            this._popup.setState(state);
        }
        invocation.return_value(null);
        if (state === 'password')
            this._close();
    }

    async CheckAsync([token], invocation) {
        const active = await this._root(invocation) && !this._destroyed && token === this._token &&
            invocation.get_sender() === this._sender && !!this._dialog && !Main.sessionMode.isLocked;
        invocation.return_value(new GLib.Variant('(b)', [active]));
    }

    _close() {
        this._polkitDialog?.disconnectObject(this);
        this._polkitDialog = null;
        this._polkitCompleted = false;
        this._pending?.return_value(new GLib.Variant('(b)', [false]));
        this._pending = null;
        if (this._watch)
            Gio.bus_unwatch_name(this._watch);
        this._watch = 0;
        if (this._timeout)
            GLib.source_remove(this._timeout);
        this._timeout = 0;
        const dialog = this._dialog;
        this._dialog = null;
        this._indicator = null;
        this._popup = null;
        this._token = null;
        this._sender = null;
        if (dialog) {
            this._closingDialog = dialog;
            dialog.connect('destroy', () => {
                if (this._closingDialog === dialog)
                    this._closingDialog = null;
            });
            if (dialog.state === ModalDialog.State.CLOSED)
                dialog.destroy();
            else
                dialog.close();
        }
    }

    destroy() {
        this._destroyed = true;
        Main.sessionMode.disconnectObject(this);
        this._close();
        this._closingDialog?.destroy();
        this._object.unexport();
        Gio.bus_unown_name(this._name);
    }
}
