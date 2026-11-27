import Clutter from 'gi://Clutter';
import Gettext from 'gettext';
import GLib from 'gi://GLib';

import {Extension, InjectionManager} from 'resource:///org/gnome/shell/extensions/extension.js';
import {AuthPrompt, AuthPromptMode, AuthPromptStatus} from 'resource:///org/gnome/shell/gdm/authPrompt.js';
import {MessageType, ShellUserVerifier} from 'resource:///org/gnome/shell/gdm/userVerifier.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {FacePopup} from './faceIndicator.js';
import {SystemAuthentication} from './systemAuthentication.js';

const DETECTION_NOTICE = 'Attempting facial authentication';

function isFaceNotice(message) {
    return message === DETECTION_NOTICE ||
        message === Gettext.dgettext('howdy', DETECTION_NOTICE);
}

export default class UnlockExperience extends Extension {
    enable() {
        this._systemAuthentication = new SystemAuthentication();
        this._injections = new InjectionManager();
        this._prompts = new Map();
        this._completedPrompts = new Set();
        Main.sessionMode.connectObject('updated', () => {
            if (Main.sessionMode.isLocked) {
                for (const indicator of this._completedPrompts)
                    indicator.destroy();
                this._completedPrompts.clear();
            }
        }, this);
        this._generation = Symbol('unlock-experience');
        const generation = this._generation;
        const extension = this;
        this._inputSignal = global.stage.connect('captured-event', (_stage, event) => {
            const allowed = [Clutter.EventType.KEY_PRESS, Clutter.EventType.BUTTON_PRESS,
                Clutter.EventType.TOUCH_BEGIN];
            if (!allowed.includes(event.type()) ||
                (event.get_flags() & Clutter.EventFlags.FLAG_SYNTHETIC) !== 0 ||
                !event.get_source_device())
                return Clutter.EVENT_PROPAGATE;
            const shield = Main.screenShield;
            const dialog = shield?._dialog;
            if (!shield?.locked || !dialog || this._activateSource ||
                dialog._activePage === dialog._promptBox ||
                dialog._authPrompt?.verificationStatus === AuthPromptStatus.VERIFICATION_SUCCEEDED)
                return Clutter.EVENT_PROPAGATE;
            this._activateSource = GLib.idle_add_once(GLib.PRIORITY_DEFAULT, () => {
                this._activateSource = 0;
                if (this._generation === generation && shield.locked && shield._dialog === dialog)
                    dialog.activate();
            });
            return Clutter.EVENT_PROPAGATE;
        });
        this._injections.overrideMethod(AuthPrompt.prototype, 'begin', original =>
            function (params) {
                original.call(this, params);
                if (this._mode !== AuthPromptMode.UNLOCK_ONLY)
                    return;
                extension._ensureIndicator(this).setState('idle');
                // 沿用 GNOME 的提前输入机制，密码仍由原认证服务验证。
                this._entry.hint_text = '密码';
                this._entryArea.show();
                this.startPreemptiveInput();
            });

        this._injections.overrideMethod(AuthPrompt.prototype, '_onShowMessage', original =>
            function (args) {
                if (this._mode === AuthPromptMode.UNLOCK_ONLY && isFaceNotice(args.message)) {
                    extension._ensureIndicator(this).setState('recognizing');
                    args.showMessageResolver?.(Promise.resolve());
                    return;
                }
                if (args.type === MessageType.ERROR)
                    extension._prompts.get(this)?.setState('password');
                original.call(this, args);
            });

        this._injections.overrideMethod(ShellUserVerifier.prototype, '_getIntervalForMessage', original =>
            function (message) {
                return isFaceNotice(message) ? 0 : original.call(this, message);
            });

        this._injections.overrideMethod(AuthPrompt.prototype, '_onAskQuestion', original =>
            function (args) {
                if (this._mode === AuthPromptMode.UNLOCK_ONLY)
                    extension._ensureIndicator(this).setState('password');
                original.call(this, args);
            });

        this._injections.overrideMethod(AuthPrompt.prototype, '_onVerificationComplete', original =>
            function () {
                if (this._mode === AuthPromptMode.UNLOCK_ONLY)
                    extension._ensureIndicator(this).setState('success');
                original.call(this);
            });

        this._injections.overrideMethod(AuthPrompt.prototype, 'reset', original =>
            function (params) {
                const indicator = extension._prompts.get(this);
                if (indicator?.state !== 'success')
                    indicator?.setState('idle');
                original.call(this, params);
            });

    }

    _ensureIndicator(prompt) {
        if (this._prompts.has(prompt))
            return this._prompts.get(prompt);
        const indicator = new FacePopup();
        this._prompts.set(prompt, indicator);
        prompt.connectObject('destroy', () => {
            if (indicator.state === 'success') {
                this._completedPrompts.add(indicator);
                indicator.connectObject('dismissed', () => {
                    this._completedPrompts.delete(indicator);
                    indicator.destroy();
                }, this);
            } else {
                indicator.destroy();
            }
            this._prompts.delete(prompt);
        }, this);
        return indicator;
    }

    disable() {
        Main.sessionMode.disconnectObject(this);
        this._systemAuthentication.destroy();
        this._generation = null;
        global.stage.disconnect(this._inputSignal);
        if (this._activateSource) {
            GLib.source_remove(this._activateSource);
            this._activateSource = 0;
        }
        this._injections.clear();
        for (const [prompt, indicator] of this._prompts) {
            prompt.disconnectObject(this);
            indicator.destroy();
        }
        this._prompts.clear();
        for (const indicator of this._completedPrompts)
            indicator.destroy();
        this._completedPrompts.clear();
    }
}
