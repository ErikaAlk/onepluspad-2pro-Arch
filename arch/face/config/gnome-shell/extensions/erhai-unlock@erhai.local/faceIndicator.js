import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {DURATION, SIZE, STATIC_UNTIL, paint} from './faceIdAnimation.js';

const reducedMotion = () => St.Settings.get().reduced_motion === St.ReducedMotion.REDUCE;

export const FaceIndicator = GObject.registerClass({Signals: {'finished': {}}},
class FaceIndicator extends St.Bin {
    _init() {
        super._init({x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER,
            visible: false, reactive: false});
        // 圆环直径约占 144 像素浮层宽度的 47%，与灵动岛中 Face ID 圆环的比例相同
        this._drawing = new St.DrawingArea({width: 88, height: 88});
        this.set_child(this._drawing);
        this._time = 0;
        this._playFrom = 0;
        this._timeline = new Clutter.Timeline({actor: this._drawing, duration: DURATION * 1000});
        this._timeline.connect('new-frame', () => {
            this._time = this._playFrom + this._timeline.get_elapsed_time() / 1000;
            this._drawing.queue_repaint();
        });
        this._timeline.connect('completed', () => {
            this._time = DURATION;
            this._drawing.queue_repaint();
            this.emit('finished');
        });
        this._drawing.connect('repaint', () => this._paint());
        this.connect('notify::mapped', () => this._syncAnimation());
        this.connect('destroy', () => this._timeline.stop());
        St.Settings.get().connectObject('notify::reduced-motion', () => this._syncAnimation(), this);
        this.state = 'idle';
    }

    setState(state) {
        if (!['idle', 'recognizing', 'password', 'success'].includes(state))
            throw new Error(`未知面容界面状态：${state}`);
        if (state === this.state)
            return;
        this._timeline.stop();
        const shown = this.state === 'recognizing' ? (GLib.get_monotonic_time() - this._startedAt) / 1000000 : 0;
        this.state = state;
        this.visible = state !== 'idle';
        this._startedAt = GLib.get_monotonic_time();
        // 识别期间停在动画开头的静止段，成功后从静止段已显示到的位置继续播放
        this._playFrom = state === 'success' ? Math.min(shown, STATIC_UNTIL) : 0;
        this._time = state === 'success' && reducedMotion() ? DURATION : this._playFrom;
        this._timeline.set_duration(Math.round((DURATION - this._playFrom) * 1000));
        // 浮层只显示动画，状态名称留给屏幕阅读器
        this.accessible_name = {idle: '', recognizing: '面容识别', password: '请输入密码', success: '完成'}[state];
        this._syncAnimation();
        this._drawing.queue_repaint();
    }

    _syncAnimation() {
        if (this.state === 'success' && reducedMotion() && this._time < DURATION) {
            this._timeline.stop();
            this._time = DURATION;
            this._drawing.queue_repaint();
            this.emit('finished');
            return;
        }
        if (this.mapped && this.state === 'success' && this._time < DURATION)
            this._timeline.start();
        else
            this._timeline.pause();
    }

    _paint() {
        const cr = this._drawing.get_context();
        const [width, height] = this._drawing.get_surface_size();
        cr.scale(width / SIZE, height / SIZE);
        paint(cr, this._time);
        cr.$dispose();
    }
});

export const FacePopup = GObject.registerClass({Signals: {'dismissed': {}}},
class FacePopup extends St.Button {
    _init(parent = Main.uiGroup) {
        super._init({style_class: 'erhai-face-popup', visible: false,
            reactive: false, can_focus: false, width: 144, height: 144});
        this.indicator = new FaceIndicator();
        this.indicator.connect('finished', () => {
            if (this.state === 'success' && !this._dismissing)
                this.dismiss();
        });
        this.set_child(this.indicator);
        this.set_pivot_point(0.5, 0);
        parent.add_child(this);
        parent.connectObject('notify::allocation', () => this._position(), this);
        this._position();
        this.connect('notify::width', () => this._position());
        Main.layoutManager.connectObject('monitors-changed', () => this._position(), this);
        St.Settings.get().connectObject('notify::reduced-motion', () => {
            if (reducedMotion()) {
                this.remove_all_transitions();
                if (this._dismissing) {
                    this._finishDismiss();
                    return;
                }
                this.opacity = 255;
                this.scale_x = 1; this.scale_y = 1; this.translation_y = 0;
            }
        }, this);
        this.connect('destroy', () => this._clearTimer());
        this.state = 'idle';
    }

    _position() {
        const monitor = Main.layoutManager.primaryMonitor;
        if (monitor) {
            const [parentX, parentY] = this.get_parent().get_transformed_position();
            this.set_position(monitor.x + (monitor.width - this.width) / 2 - parentX,
                monitor.y + 10 - parentY);
        }
    }

    _clearTimer() {
        if (this._finishSource)
            GLib.source_remove(this._finishSource);
        this._finishSource = 0;
    }

    setState(state) {
        if (state === this.state && !this._dismissing)
            return;
        this._clearTimer();
        if (this._dismissing) {
            this.remove_all_transitions();
            this.hide();
        }
        this._dismissing = false;
        this._afterDismiss = null;
        this.state = state;
        this.indicator.setState(state);
        if (state === 'idle' || state === 'password') {
            this.remove_all_transitions();
            this.hide();
            return;
        }
        if (!this.visible) {
            this._position();
            this.remove_all_transitions();
            this.opacity = reducedMotion() ? 255 : 0;
            this.translation_y = reducedMotion() ? 0 : -54;
            this.scale_x = reducedMotion() ? 1 : 0.58;
            this.scale_y = reducedMotion() ? 1 : 0.12;
            this.show();
            this.ease({opacity: 255, translation_y: 0, scale_x: 1, scale_y: 1,
                duration: reducedMotion() ? 0 : 440, mode: Clutter.AnimationMode.EASE_OUT_CUBIC});
        }
        // 减少动态时停留在完成画面；其余情况由成功动画的 finished 信号收起
        if (state === 'success' && reducedMotion()) {
            this._finishSource = GLib.timeout_add_once(GLib.PRIORITY_DEFAULT, 700, () => {
                this._finishSource = 0;
                this.dismiss();
            });
        }
    }

    dismiss(onComplete = null) {
        this._clearTimer();
        this.remove_all_transitions();
        this._dismissing = true;
        this._afterDismiss = onComplete;
        this.ease({opacity: 0, translation_y: -54, scale_x: 0.58, scale_y: 0.12,
            duration: reducedMotion() ? 0 : 240, mode: Clutter.AnimationMode.EASE_IN_CUBIC,
            onComplete: () => this._finishDismiss()});
    }

    _finishDismiss() {
        this._dismissing = false;
        this.hide();
        this.indicator.setState('idle');
        this.state = 'idle';
        const callback = this._afterDismiss;
        this._afterDismiss = null;
        this.emit('dismissed');
        callback?.();
    }
});
