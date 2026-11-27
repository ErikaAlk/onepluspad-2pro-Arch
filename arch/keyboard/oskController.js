// SPDX-License-Identifier: GPL-3.0-or-later
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import St from 'gi://St';
import {InjectionManager} from 'resource:///org/gnome/shell/extensions/extension.js';
import {InputMethod} from 'resource:///org/gnome/shell/misc/inputMethod.js';
import {Keyboard} from 'resource:///org/gnome/shell/ui/keyboard.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {InputFocusClient} from './inputFocus.js';

const KEYBOARD_XML = '<node><interface name="org.erhai.ScreenKeyboard1">' +
    '<method name="Show"/><method name="Hide"/><method name="Toggle"/>' +
    '<method name="GetState"><arg type="s" direction="out"/></method>' +
    '<signal name="VisibilityChanged"><arg type="b"/></signal></interface></node>';

export class OskController {
    constructor(directory) {
        this._injections = new InjectionManager();
        this._pending = 0;
        this._pointRefresh = 0;
        this._manualOpen = false;
        this._generation = 1;
        this._accessible = null;
        this._suppressed = null;
        this._nativeId = 1;
        this._shellIds = new WeakMap();
        this._closeKeys = new Set();
        this._nativeGeneration = Main.inputMethod.currentFocus ? this._generation : -1;
        this._touchInput = Main.keyboard._lastDeviceIsTouchscreen();
        this._inputTouch = false;
        this._touchSerial = 0;
        this.button = new St.Button({
            style_class: 'panel-button',
            style: 'padding: 0 8px;',
            accessible_name: '虚拟键盘',
            can_focus: true,
            track_hover: true,
            child: new St.Icon({gicon: new Gio.FileIcon({file:
                directory.get_child('icons').get_child('keyboard-symbolic.svg')}),
                style_class: 'system-status-icon'}),
        });
        this.button.connect('clicked', () => this.Toggle());
        Main.panel._rightBox.insert_child_at_index(this.button, 0);
        global.stage.connectObject('captured-event', (_stage, event) => {
            const type = event.type();
            if (type === Clutter.EventType.TOUCH_BEGIN) {
                const [x, y] = event.get_coords();
                if (this._hitShell({x, y}))
                    return Clutter.EVENT_PROPAGATE;
                this._touchInput = true;
                this._touchSerial++;
                this._confirmedTap = null;
                this._panelGeneration = -1;
                this._tapTarget = null;
                const actor = global.stage.get_actor_at_pos(Clutter.PickMode.REACTIVE, x, y);
                this._inputTouch = Boolean(actor && global.display.focus_window?.get_compositor_private()?.contains(actor))
                    || this._hitShell({x, y});
            } else if (type === Clutter.EventType.BUTTON_PRESS ||
                (type === Clutter.EventType.KEY_PRESS && event.get_device().get_device_node()))
                this._touchInput = false;
            return Clutter.EVENT_PROPAGATE;
        }, 'notify::key-focus', () => this._syncShellGesture(), this);
        this._tapGesture = new Clutter.ClickGesture({n_clicks_required: 1, recognize_on_press: false});
        this._tapGesture.connect('should-handle-sequence', (_gesture, event) => {
            if (event.type() !== Clutter.EventType.TOUCH_BEGIN)
                return false;
            const [x, y] = event.get_coords();
            const target = global.stage.get_actor_at_pos(Clutter.PickMode.REACTIVE, x, y);
            const window = global.display.focus_window?.get_compositor_private();
            return Boolean(target && window?.contains(target));
        });
        this._tapGesture.connect('may-recognize', () => {
            const [x, y] = this._tapGesture.get_point_event(0).get_coords();
            this._confirmedTap = this._generation;
            if (this._panelGeneration === this._generation && this._nativeActive())
                this._suppressed = null;
            const point = {x, y, generation: this._generation, serial: this._touchSerial};
            if (this._pointRefresh)
                global.stage.disconnect(this._pointRefresh);
            this._pointRefresh = global.stage.connect('after-paint', () => {
                global.stage.disconnect(this._pointRefresh);
                this._pointRefresh = 0;
                if (point.generation === this._generation && point.serial === this._touchSerial)
                    this._focusClient.refresh(point);
            });
            global.stage.queue_redraw();
            // 观察原生点击识别结果，应用继续接收完整的触控序列。
            return false;
        });
        global.stage.add_action(this._tapGesture);
        global.display.connectObject('notify::focus-window', () => {
            this._generation++;
            this._nativeGeneration = -1;
            this._accessible = null;
            this._tapTarget = null;
            this._suppressed = null;
            this._queueOpen();
            this._focusClient.refresh();
        }, this);
        global.backend.connectObject('last-device-changed', (_backend, device) => {
            const type = device.get_device_type();
            if (type === Clutter.InputDeviceType.TOUCHSCREEN_DEVICE)
                this._touchInput = true;
            else if (device.get_device_node())
                this._touchInput = false;
        }, this);
        const controller = this;
        this._injections.overrideMethod(Main.keyboard, '_syncEnabled', original => {
            return function () {
                if (!controller._manualOpen && !Main.keyboard.visible)
                    original.call(this);
            };
        });
        this._injections.overrideMethod(InputMethod.prototype, 'vfunc_focus_in', original => {
            return function (focus) {
                original.call(this, focus);
                controller._nativeGeneration = controller._generation;
                controller._nativeId++;
                controller._accessible = null;
                controller._queueOpen();
            };
        });
        this._injections.overrideMethod(InputMethod.prototype, 'vfunc_focus_out', original => {
            return function () {
                original.call(this);
                controller._nativeGeneration = -1;
                controller._accessible = null;
                controller._queueOpen();
            };
        });
        this._injections.overrideMethod(Keyboard.prototype, 'open', original => {
            return function (immediate = false) {
                if (controller._applying)
                    return original.call(this, immediate || controller._touchInput);
                if (this._gestureInProgress)
                    controller.Show();
                else
                    controller._queueOpen();
            };
        });
        this._injections.overrideMethod(Main.keyboard, 'close', () => () => controller.Hide());
        this._injections.overrideMethod(Keyboard.prototype, '_updateKeys', original => {
            return function () {
                original.call(this);
                controller._watchCloseKeys(this);
            };
        });
        Main.inputMethod.connectObject('notify::content-hints', () => this._queueOpen(),
            'input-panel-state', (_method, state) => {
                if (state === Clutter.InputPanelState.ON && this._touchInput && this._inputTouch) {
                    this._panelGeneration = this._generation;
                    if (this._confirmedTap === this._generation && this._nativeActive())
                        this._suppressed = null;
                }
                this._queueOpen();
            }, this);
        Main.keyboard.connectObject('visibility-changed', () => this._syncButton(), this);
        Main.sessionMode.connectObject('updated', () => {
            if (Main.sessionMode.isLocked)
                this.Hide();
            this._queueOpen();
        }, this);
        this._focusClient = new InputFocusClient(() => ({generation: this._generation,
            pid: global.display.focus_window?.get_pid() ?? 0,
            targets: this._nativeActive() && !this._accessible}), (state, point) => {
            const window = global.display.focus_window;
            const {targets = [], ...focus} = state ?? {};
            this._accessible = focus.generation === this._generation && focus.pid === window?.get_pid()
                && focus.focused && focus.editable && focus.active ? focus : null;
            if (point && point.generation === this._generation && point.serial === this._touchSerial &&
                this._confirmedTap === this._generation) {
                const target = targets.find(candidate => candidate.pid === window?.get_pid() &&
                    candidate.generation === this._generation && candidate.active && candidate.editable &&
                    this._hitAccessible(point, candidate));
                if (this._accessible || (target && this._nativeActive())) {
                    this._tapTarget = target ?? (this._hitAccessible(point) ? this._accessible : null);
                    this._suppressed = null;
                }
            }
            this._queueOpen();
        });
        this._object = Gio.DBusExportedObject.wrapJSObject(KEYBOARD_XML, this);
        this._object.export(Gio.DBus.session, '/org/erhai/ScreenKeyboard');
        this._busName = Gio.bus_own_name_on_connection(Gio.DBus.session, 'org.erhai.ScreenKeyboard1',
            Gio.BusNameOwnerFlags.NONE, null, null);
        this._syncButton();
        if (Main.keyboard.keyboardActor)
            this._watchCloseKeys(Main.keyboard.keyboardActor);
        this._syncShellGesture();
    }

    _syncShellGesture() {
        const focus = global.stage.key_focus;
        if (this._shellEntry === focus)
            return;
        this._removeShellGesture();
        if (!(focus instanceof Clutter.Text) || !focus.get_editable())
            return;
        const gesture = new Clutter.ClickGesture({n_clicks_required: 1, recognize_on_press: false});
        for (const native of focus.get_actions()) {
            if (native instanceof Clutter.ClickGesture) {
                native.can_not_cancel(gesture);
                gesture.can_not_cancel(native);
            }
        }
        gesture.connect('should-handle-sequence', (_gesture, event) => {
            if (event.type() !== Clutter.EventType.TOUCH_BEGIN)
                return false;
            const [x, y] = event.get_coords();
            const target = global.stage.get_actor_at_pos(Clutter.PickMode.REACTIVE, x, y);
            for (let actor = target; actor && actor !== this._shellGestureActor; actor = actor.get_parent()) {
                for (const native of actor.get_actions()) {
                    if (native instanceof Clutter.ClickGesture) {
                        native.can_not_cancel(gesture);
                        gesture.can_not_cancel(native);
                    }
                }
            }
            this._touchInput = true;
            this._touchSerial++;
            this._confirmedTap = null;
            this._panelGeneration = -1;
            this._inputTouch = true;
            this._tapTarget = null;
            return true;
        });
        gesture.connect('may-recognize', () => {
            if (global.stage.key_focus === focus && focus.get_editable()) {
                this._confirmedTap = this._generation;
                this._suppressed = null;
                this._queueOpen();
            }
            return false;
        });
        this._shellEntry = focus;
        this._shellTapGesture = gesture;
        this._shellGestureActor = focus.get_parent() instanceof St.Entry ? focus.get_parent() : focus;
        this._shellGestureActor.add_action(gesture);
        focus.connectObject('destroy', () => this._removeShellGesture(), this);
    }

    _removeShellGesture() {
        if (!this._shellEntry)
            return;
        this._shellGestureActor.remove_action(this._shellTapGesture);
        this._shellEntry.disconnectObject(this);
        this._shellEntry = null;
        this._shellTapGesture = null;
        this._shellGestureActor = null;
    }

    _watchCloseKeys(actor) {
        if (actor._icon?.icon_name === 'osk-hide-symbolic' && !this._closeKeys.has(actor)) {
            this._closeKeys.add(actor);
            actor.connectObject('released', () => this.Hide(),
                'destroy', () => this._closeKeys.delete(actor), this);
        }
        for (const child of actor.get_children())
            this._watchCloseKeys(child);
    }

    _nativeActive() {
        const focus = global.stage.key_focus;
        return Boolean(Main.inputMethod.currentFocus &&
            ((focus instanceof Clutter.Text && focus.get_editable()) ||
                this._nativeGeneration === this._generation));
    }

    _focusToken() {
        const focus = global.stage.key_focus;
        if (focus instanceof Clutter.Text && focus.get_editable()) {
            if (!this._shellIds.has(focus))
                this._shellIds.set(focus, ++this._nativeId);
            return `shell:${this._shellIds.get(focus)}`;
        }
        return this._accessible?.id ?? (this._nativeActive()
            ? `native:${this._generation}:${this._nativeId}` : null);
    }

    _hitShell(point) {
        const focus = global.stage.key_focus;
        if (!(focus instanceof Clutter.Text) || !focus.get_editable())
            return false;
        const entry = focus.get_parent() instanceof St.Entry ? focus.get_parent() : focus;
        const target = global.stage.get_actor_at_pos(Clutter.PickMode.REACTIVE, point.x, point.y);
        return Boolean(target && (target === entry || entry.contains(target)));
    }

    _hitAccessible(point, accessible = this._accessible) {
        if (!accessible || point.generation !== this._generation || point.serial !== this._touchSerial)
            return false;
        const [x, y, width, height] = accessible.rect;
        const [frameWidth, frameHeight] = accessible.frameSize;
        if (width <= 0 || height <= 0 || frameWidth <= 0 || frameHeight <= 0)
            return false;
        const rect = global.display.focus_window.get_client_content_rect();
        const document = accessible.documentRect;
        const monitor = Main.layoutManager.monitors[global.display.focus_window.get_monitor()];
        const scale = monitor.geometry_scale;
        const buffer = global.display.focus_window.get_buffer_rect();
        const reference = frameWidth === rect.width && frameHeight === rect.height ? rect :
            frameWidth === buffer.width && frameHeight === buffer.height ? buffer : null;
        if (document && reference) {
            const offsetX = (rect.x - reference.x) * scale;
            const offsetY = (rect.y - reference.y) * scale;
            if (document[0] >= offsetX && document[1] >= offsetY &&
                document[0] + document[2] === offsetX + rect.width * scale &&
                document[1] + document[3] === offsetY + rect.height * scale)
                return point.x >= reference.x + x / scale && point.y >= reference.y + y / scale &&
                    point.x < reference.x + (x + width) / scale && point.y < reference.y + (y + height) / scale;
        }
        if (rect.width !== frameWidth || rect.height !== frameHeight)
            return false;
        return point.x >= rect.x + x && point.y >= rect.y + y &&
            point.x < rect.x + x + width && point.y < rect.y + y + height;
    }

    _queueOpen() {
        if (this._pending)
            return;
        this._pending = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._pending = 0;
            const token = this._focusToken();
            const inhibited = this._nativeActive() &&
                (Main.inputMethod.content_hints & Clutter.InputContentHintFlags.INHIBIT_OSK) !== 0;
            if (Main.sessionMode.isLocked || ((!token || !this._touchInput) && !this._manualOpen))
                this._close();
            else if (this._touchInput && token && !inhibited && token !== this._suppressed)
                this._show(false);
            return GLib.SOURCE_REMOVE;
        });
    }

    Show() {
        if (!Main.sessionMode.isLocked) {
            this._suppressed = null;
            this._show(true);
        }
    }

    Hide() {
        this._touchSerial++;
        this._confirmedTap = null;
        this._panelGeneration = -1;
        this._suppressed = this._focusToken();
        this._close();
    }

    Toggle() {
        if (Main.keyboard.visible)
            this.Hide();
        else
            this.Show();
    }

    GetState() {
        return JSON.stringify({visible: Boolean(Main.keyboard.visible), manual: this._manualOpen,
            nativeFocus: this._nativeActive(), accessibleFocus: this._accessible,
            tapTarget: this._tapTarget,
            generation: this._generation, touch: this._touchInput});
    }

    toggle() { this.Toggle(); }

    _close() {
        this._manualOpen = false;
        Main.keyboard.keyboardActor?.close(true);
    }

    _show(manual) {
        const manager = Main.keyboard;
        this._manualOpen ||= manual;
        if (!manager._keyboard) {
            manager._keyboard = new Keyboard();
            manager._keyboard.connect('visibility-changed', () => {
                manager.emit('visibility-changed');
                manager._bottomDragGesture.enabled = !manager.visible;
            });
        }
        if (!this._nativeActive() && this._accessible) {
            const purpose = this._accessible.protected
                ? Clutter.InputContentPurpose.PASSWORD : Clutter.InputContentPurpose.NORMAL;
            const hints = this._accessible.protected
                ? Clutter.InputContentHintFlags.HIDDEN_TEXT | Clutter.InputContentHintFlags.SENSITIVE_DATA : 0;
            const keyboard = manager.keyboardActor;
            if (keyboard._keyboardController._purpose !== purpose) {
                keyboard._keyboardController._purpose = purpose;
                keyboard._updateKeys();
            }
            keyboard._onContentHintsChanged(keyboard._keyboardController, hints);
        }
        Main.layoutManager.keyboardIndex = Main.layoutManager.focusIndex;
        this._applying = true;
        try {
            manager.keyboardActor.open(true);
        } finally {
            this._applying = false;
        }
        this._syncButton();
    }

    _syncButton() {
        if (!Main.keyboard.visible)
            this._manualOpen = false;
        if (Main.keyboard.visible) {
            if (!this._layerOrder) {
                const actors = [global.compositor.get_input_panel_group(), Main.layoutManager.screenshotUIGroup];
                const children = Main.uiGroup.get_children();
                this._layerOrder = actors.map(actor => ({actor,
                    next: children[children.indexOf(actor) + 1] ?? null}));
            }
            // 输入面板需要覆盖启动台和Dock，截图界面保持在最上方。
            for (const {actor} of this._layerOrder)
                Main.uiGroup.set_child_above_sibling(actor, null);
        } else {
            this._restoreLayerOrder();
        }
        if (Main.keyboard.visible)
            this.button.add_style_pseudo_class('active');
        else
            this.button.remove_style_pseudo_class('active');
        this.button.accessible_name = Main.keyboard.visible ? '收起虚拟键盘' : '显示虚拟键盘';
        this._object?.emit_signal('VisibilityChanged', new GLib.Variant('(b)', [Boolean(Main.keyboard.visible)]));
    }

    _restoreLayerOrder() {
        if (!this._layerOrder)
            return;
        for (const {actor, next} of this._layerOrder.toReversed()) {
            if (actor.get_parent() === Main.uiGroup) {
                if (next)
                    Main.uiGroup.set_child_below_sibling(actor, next);
                else
                    Main.uiGroup.set_child_above_sibling(actor, null);
            }
        }
        this._layerOrder = null;
    }

    destroy() {
        if (this._pointRefresh)
            global.stage.disconnect(this._pointRefresh);
        this._pointRefresh = 0;
        if (this._pending)
            GLib.source_remove(this._pending);
        this._pending = 0;
        this._manualOpen = false;
        this._injections.clear();
        this._focusClient.destroy();
        for (const key of this._closeKeys)
            key.disconnectObject(this);
        this._closeKeys.clear();
        this._object.unexport();
        Gio.bus_unown_name(this._busName);
        this._removeShellGesture();
        global.stage.remove_action(this._tapGesture);
        this._tapGesture = null;
        this._restoreLayerOrder();
        global.stage.disconnectObject(this);
        global.display.disconnectObject(this);
        global.backend.disconnectObject(this);
        Main.sessionMode.disconnectObject(this);
        Main.inputMethod.disconnectObject(this);
        Main.keyboard.disconnectObject(this);
        this.button.destroy();
        Main.keyboard._syncEnabled();
    }
}
