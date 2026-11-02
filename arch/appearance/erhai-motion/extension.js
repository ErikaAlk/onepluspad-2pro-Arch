import Clutter from 'gi://Clutter';
import St from 'gi://St';
import Meta from 'gi://Meta';
import Graphene from 'gi://Graphene';
import Shell from 'gi://Shell';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Cogl from 'gi://Cogl';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as BoxPointer from 'resource:///org/gnome/shell/ui/boxpointer.js';
import {MonitorGroup} from 'resource:///org/gnome/shell/ui/workspaceAnimation.js';
import {OverviewAdjustment} from 'resource:///org/gnome/shell/ui/overviewControls.js';
import {OsdWindow} from 'resource:///org/gnome/shell/ui/osdWindow.js';
import {ModalDialog} from 'resource:///org/gnome/shell/ui/modalDialog.js';
import {Extension, InjectionManager} from 'resource:///org/gnome/shell/extensions/extension.js';
import {PopupBlurTargets} from '../blur-my-shell@aunetx/components/popup/targets.js';
import {PopupBlurSurface} from '../blur-my-shell@aunetx/components/popup/surface/blur_surface.js';
import {PopupBlurSurfaceStyle} from '../blur-my-shell@aunetx/components/popup/surface/style.js';
import {Pipeline} from '../blur-my-shell@aunetx/pipelines/pipeline.js';
import * as BlurUtils from '../blur-my-shell@aunetx/conveniences/utils.js';
import {ContinuousSurface} from './continuousSurface.js';

const SURFACES = [
    'glasslight-glass',
    'notification-banner', 'osd-window', 'modal-dialog',
    'lintel-system-menu-content', 'lintel-status-menu-content',
    'lintel-cc-tile', 'lintel-cc-media', 'lintel-cc-slider',
    'lintel-cc-edit-controls', 'lintel-cc-edit-toolbar', 'lintel-cc-gallery',
    'lintel-cc-output-page',
    'lintel-nc-widget-card', 'lintel-nc-edit-button', 'lintel-nc-widget-gallery',
    'lintel-nc-widget-edit-pill', 'lintel-charge-toast',
];
const CONTAINERS = ['lintel-cc-popup', 'lintel-cc-menu', 'lintel-notification-center',
    'lintel-notification-center-root'];
const GEOMETRY = ['x', 'y', 'translation_x', 'translation_y', 'scale_x', 'scale_y'];
Gio._promisify(Shell.Screenshot, 'composite_to_stream', 'composite_to_stream_finish');

function has(actor, classes) {
    return actor instanceof St.Widget && classes.some(name => actor.has_style_class_name(name));
}

function notification(actor) {
    if (!has(actor, ['message']))
        return false;
    for (let parent = actor.get_parent(); parent; parent = parent.get_parent()) {
        if (parent.name === 'lintelNotificationCenter')
            return true;
    }
    return false;
}

function surface(actor) {
    if (has(actor, SURFACES) || notification(actor))
        return true;
    if (has(actor, ['popup-menu-content'])) {
        for (let parent = actor.get_parent(); parent; parent = parent.get_parent()) {
            if (has(parent, ['tpct-appmenu-menu']))
                return true;
        }
    }
    return false;
}

function motionEnabled() {
    const settings = St.Settings.get();
    return settings.enable_animations && settings.reduced_motion !== St.ReducedMotion.REDUCE;
}

function motionCurve(transition, bounded = false) {
    if (!transition)
        return;
    transition.set_cubic_bezier_progress(
        new Graphene.Point({x: 0.20, y: bounded ? 1 : 1.20}),
        new Graphene.Point({x: 0.40, y: 1}));
}

export default class ErhaiMotion extends Extension {
    enable() {
        if (!global.blur_my_shell?._popup)
            throw new Error('实时玻璃组件没有加载');
        if (!Main.extensionManager.lookup('lintel@topbar')?.stateObj?._controller?._notificationCenter)
            throw new Error('菜单栏通知中心没有加载');
        this._injections = new InjectionManager();
        this.metrics = {windowOpen: 0, windowClose: 0, minimize: 0, restore: 0,
            resize: 0, menus: 0, notificationCenter: 0, overview: 0, workspace: 0,
            notifications: 0, osd: 0, dialogs: 0};
        this._enableMaterials();
        this._enableMotion();
        this._contrastTimes = new WeakMap();
        this._contrastPending = new WeakSet();
        this._contrastBuffers = new WeakMap();
        this._contrastInFlight = 0;
        this.contrastStats = {samples: 0, maxPixels: 0};
        this._contrastGeneration = {};
        this._contrastFrameId = global.stage.connect('after-paint', () => this._updateContrast());
        this.ready = true;
    }

    _enableMaterials() {
        const injections = this._injections;
        const owner = this;
        this._continuous = new Map();
        const [, shaderBytes] = this.dir.get_child('shaders').get_child('refraction.glsl').load_contents(null);
        const [, geometryBytes] = this.dir.get_child('shaders').get_child('smoothGeometry.glsl').load_contents(null);
        const shader = new TextDecoder().decode(geometryBytes) + '\n' + new TextDecoder().decode(shaderBytes);
        injections.overrideMethod(Pipeline.prototype, 'setup_effect', original =>
            function (effect, info, params, role = null) {
                if (this.actor?._erhaiGlass && info.type === 'refraction' && !role) {
                    effect._erhaiOriginalSnippet = effect.surfaceSnippet;
                    BlurUtils.initialize_shader_effect(effect, shader);
                }
                return original.call(this, effect, info, params, role);
            });
        injections.overrideMethod(Pipeline.prototype, 'release_effect', original =>
            function (effect) {
                const snippet = effect._erhaiOriginalSnippet;
                const result = original.call(this, effect);
                if (snippet) {
                    effect.surfaceSnippet = snippet;
                    delete effect._erhaiOriginalSnippet;
                }
                return result;
            });
        injections.overrideMethod(PopupBlurSurface.prototype, 'enable', original =>
            function () {
                const result = original.call(this);
                if (result && surface(this.target))
                    owner._continuous.set(this, new ContinuousSurface(this));
                return result;
            });
        injections.overrideMethod(PopupBlurSurface.prototype, 'update', original =>
            function () {
                if (surface(this.target) && (!this.target.mapped || !this.root_actor.mapped)) {
                    if (this.actor.visible || this.placement.ready)
                        this.hide_surface();
                    return;
                }
                return original.call(this);
            });
        injections.overrideMethod(PopupBlurSurface.prototype, 'destroy', original =>
            function () {
                owner._continuous.get(this)?.destroy();
                owner._continuous.delete(this);
                return original.call(this);
            });
        injections.overrideMethod(PopupBlurSurface.prototype, 'is_below_sibling', original =>
            function (sibling) {
                const drawing = owner._continuous.get(this)?.drawing;
                if (drawing && this.actor.get_next_sibling() === drawing
                    && drawing.get_next_sibling() === sibling)
                    return true;
                return original.call(this, sibling);
            });
        injections.overrideMethod(PopupBlurSurface.prototype, 'set_actor_position', original =>
            function () {
                const result = original.call(this);
                const drawing = owner._continuous.get(this)?.drawing;
                if (drawing && this.actor.get_next_sibling() !== drawing)
                    this.parent.set_child_above_sibling(drawing, this.actor);
                return result;
            });
        injections.overrideMethod(PopupBlurTargets.prototype, 'is_blur_target_actor', original =>
            function (actor) {
                return surface(actor) || original.call(this, actor);
            });
        injections.overrideMethod(PopupBlurTargets.prototype, 'prefers_descendant_targets', original =>
            function (actor) {
                return has(actor, CONTAINERS) || original.call(this, actor);
            });
        injections.overrideMethod(PopupBlurSurface.prototype, 'get_corner_radius', original =>
            function () {
                if (surface(this.target))
                    return this.target.get_theme_node().get_border_radius(St.Corner.TOPLEFT)
                        / St.ThemeContext.get_for_stage(global.stage).scale_factor;
                return original.call(this);
            });
        injections.overrideMethod(PopupBlurSurface.prototype, 'uses_full_actor_geometry', original =>
            function () {
                return surface(this.target) || original.call(this);
            });
        injections.overrideMethod(PopupBlurSurface.prototype, 'get_actor_opacity', original =>
            function (opacity) {
                return surface(this.target) ? opacity : original.call(this, opacity);
            });
        injections.overrideMethod(PopupBlurSurface.prototype, 'get_pipeline_opacity', original =>
            function (opacity) {
                return surface(this.target) ? 255 : original.call(this, opacity);
            });
        injections.overrideMethod(PopupBlurSurface.prototype, 'create_actor', original =>
            function () {
                const result = original.call(this);
                if (surface(this.target) && this.pipeline?.contentActor)
                    this.pipeline.contentActor._erhaiGlass = true;
                return result;
            });
        injections.overrideMethod(PopupBlurSurfaceStyle.prototype, 'set_liquid_glass', original =>
            function (enabled) {
                const wasActive = this.liquid_glass;
                const result = original.call(this, enabled);
                if (!enabled && wasActive)
                    this.surface.target.remove_style_class_name('erhai-glass-light');
                return result;
            });
        injections.overrideMethod(Pipeline.prototype, 'get_effect_params', original =>
            function (info) {
                const params = original.call(this, info);
                if (!this.actor?._erhaiGlass)
                    return params;
                if (info.type === 'luminosity')
                    return {...params, saturation_multiplicator: 1.05};
                if (info.type === 'refraction')
                    return {...params, blur_radius: 14, rgb_fringing: 0.03, specular_strength: 0.10};
                if (info.type === 'noise')
                    return {...params, noise: 0.025};
                return params;
            });
        const center = Main.extensionManager.lookup('lintel@topbar')?.stateObj
            ?._controller?._notificationCenter;
        if (!center)
            throw new Error('菜单栏通知中心没有启用');
        for (const method of ['_syncNotificationGroup', '_rebuildWidgets']) {
            injections.overrideMethod(center.constructor.prototype, method, original =>
                function (...params) {
                    const result = original.apply(this, params);
                    global.blur_my_shell?._popup.queue_try_blur(params[0] ?? this._root);
                    return result;
                });
        }
        this._refreshMaterials();
    }

    _updateContrast() {
        const controller = Main.extensionManager.lookup('lintel@topbar')?.stateObj?._controller;
        const animated = [controller?._controlCenter?.menu.actor, controller?._notificationCenter?._column];
        if (animated.some(actor => actor?.mapped && ['opacity', 'translation-x', 'translation-y', 'scale-x', 'scale-y']
            .some(property => actor.get_transition(property))))
            return;
        const now = GLib.get_monotonic_time();
        for (const entry of global.blur_my_shell?._popup?.surfaces.values() ?? []) {
            if (this._contrastInFlight >= 2)
                break;
            if (!surface(entry.target) || !entry.target.mapped || this._contrastPending.has(entry))
                continue;
            if (entry.transitions.has_running())
                continue;
            const capture = entry.pipeline?.captureEffect?.target;
            const previous = this._contrastTimes.get(entry) ?? 0;
            if (!capture || now - previous < 250000 || capture.lastUsed <= previous)
                continue;
            this._contrastTimes.set(entry, now);
            this._contrastPending.add(entry);
            this._contrastInFlight++;
            this._contrastTask = this._sampleContrast(entry, capture, this._contrastGeneration);
        }
    }

    async _sampleContrast(entry, capture, generation) {
        try {
            await this._readContrast(entry, capture, generation);
        } finally {
            if (generation === this._contrastGeneration) {
                this._contrastPending.delete(entry);
                this._contrastInFlight--;
            }
        }
    }

    async _readContrast(entry, capture, generation) {
        const scale = Math.min(1, 32 / Math.max(capture.usedWidth, capture.usedHeight));
        const width = Math.max(1, Math.round(capture.usedWidth * scale));
        const height = Math.max(1, Math.round(capture.usedHeight * scale));
        let buffer = this._contrastBuffers.get(entry);
        if (!buffer || buffer.width !== width || buffer.height !== height
            || buffer.context !== capture.context) {
            const texture = Cogl.Texture2D.new_with_size(capture.context, width, height);
            texture.allocate();
            const framebuffer = Cogl.Offscreen.new_with_texture(texture);
            framebuffer.allocate();
            const pipeline = Cogl.Pipeline.new(capture.context);
            pipeline.set_layer_filters(0, Cogl.PipelineFilter.LINEAR, Cogl.PipelineFilter.LINEAR);
            buffer = {texture, framebuffer, pipeline, width, height, context: capture.context};
            this._contrastBuffers.set(entry, buffer);
        }
        buffer.pipeline.set_layer_texture(0, capture.texture);
        buffer.framebuffer.orthographic(0, 0, width, height, -1, 1);
        buffer.framebuffer.draw_textured_rectangle(buffer.pipeline, 0, 0, width, height,
            0, 0, capture.usedWidth / capture.width, capture.usedHeight / capture.height);
        buffer.framebuffer.flush();
        const pixels = await Shell.Screenshot.composite_to_stream(buffer.texture, 0, 0,
            width, height, 1, null, 0, 0, 1, Gio.MemoryOutputStream.new_resizable());
        if (generation !== this._contrastGeneration)
            return;
        if (global.blur_my_shell?._popup.surfaces.get(entry.target) !== entry)
            return;
        if (pixels.width > 32 || pixels.height > 32)
            throw new Error('材质明暗采样超出尺寸限制');
        this.contrastStats.samples++;
        this.contrastStats.maxPixels = Math.max(this.contrastStats.maxPixels, pixels.width * pixels.height);
        const data = pixels.get_pixels();
        const channels = pixels.get_n_channels();
        const stride = pixels.get_rowstride();
        const luminances = [];
        const linear = value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
        for (let row = 0; row < pixels.height; row++) {
            for (let column = 0; column < pixels.width; column++) {
                const offset = row * stride + column * channels;
                luminances.push(0.2126 * linear(data[offset] / 255)
                    + 0.7152 * linear(data[offset + 1] / 255)
                    + 0.0722 * linear(data[offset + 2] / 255));
            }
        }
        luminances.sort((first, second) => first - second);
        const middle = luminances[Math.floor(luminances.length / 2)];
        if (middle > 0.30)
            entry.target.add_style_class_name('erhai-glass-light');
        else if (middle < 0.20)
            entry.target.remove_style_class_name('erhai-glass-light');
    }

    _refreshMaterials() {
        const popup = global.blur_my_shell?._popup;
        if (!popup?.enabled)
            return;
        for (const [target] of [...popup.surfaces]) {
            if (has(target, CONTAINERS) || surface(target))
                popup.destroy_blur(target);
        }
        for (const child of Main.uiGroup.get_children())
            popup.try_blur(child);
    }

    _enableMotion() {
        const owner = this;
        this._menuStarts = new WeakMap();
        this._injections.overrideMethod(BoxPointer.BoxPointer.prototype, 'open', original =>
            function (animate, onComplete) {
                owner._menuStarts.set(this, {reversing: this.get_transition('opacity') !== null,
                    scale: this.get_scale(), opacity: this.opacity});
                if (!motionEnabled())
                    this.set_scale(1, 1);
                return original.call(this, animate, onComplete);
            });
        this._injections.overrideMethod(BoxPointer.BoxPointer.prototype, 'close', original =>
            function (animate, onComplete) {
                return original.call(this, animate, () => {
                    this.set_scale(1, 1);
                    onComplete?.();
                });
            });
        this._injections.overrideMethod(Clutter.Actor.prototype, 'ease', original =>
            function (params) {
                if (!motionEnabled() || !(params.duration > 0))
                    return original.call(this, params);
                let kind;
                let duration = 440;
                if (this instanceof Meta.WindowActor) {
                    const wm = Main.wm;
                    if (wm._mapping.has(this)) {
                        kind = 'windowOpen';
                        this.set_pivot_point(0.5, 0.5);
                        this.set_scale(0.92, 0.94);
                    } else if (wm._destroying.has(this)) {
                        kind = 'windowClose';
                        params = {...params, scale_x: 0.96, scale_y: 0.96, opacity: 0};
                        duration = 200;
                    } else if (wm._minimizing.has(this)) {
                        kind = 'minimize';
                        duration = 460;
                    } else if (wm._unminimizing.has(this)) {
                        kind = 'restore';
                        duration = 460;
                    } else if (wm._resizing.has(this)) {
                        kind = 'resize';
                    }
                } else if ([...Main.wm._resizing].some(actor => actor.__animationInfo?.clone === this)) {
                    kind = 'resize';
                } else if (this instanceof BoxPointer.BoxPointer) {
                    kind = 'menus';
                    const opening = params.opacity === 255;
                    const controlCenter = has(this, ['lintel-cc-menu']);
                    if (opening) {
                        const start = owner._menuStarts.get(this);
                        this.set_scale(...(controlCenter ? [1, 1]
                            : start?.reversing ? start.scale : [0.86, 0.80]));
                        if (controlCenter) {
                            if (!start?.reversing)
                                this.translation_y = -8;
                            params = {...params, translation_y: 0, scale_x: 1, scale_y: 1};
                            duration = 260;
                        }
                        if (start?.reversing)
                            this.opacity = start.opacity;
                    } else {
                        params = {...params, scale_x: 0.94, scale_y: 0.90};
                        if (has(this, ['tpct-cascade-menu']))
                            params.translation_y = this.translation_y;
                        duration = 220;
                        if (controlCenter)
                            params = {...params, scale_x: 1, scale_y: 1, translation_y: -6};
                    }
                } else if (this === Main.extensionManager.lookup('lintel@topbar')?.stateObj
                    ?._controller?._notificationCenter?._column) {
                    kind = 'notificationCenter';
                } else if (this === Main.messageTray._bannerBin) {
                    kind = 'notifications';
                    duration = 360;
                } else if (this instanceof OsdWindow) {
                    kind = 'osd';
                    duration = 240;
                } else if (this instanceof ModalDialog) {
                    kind = 'dialogs';
                    duration = 240;
                }
                if (!kind)
                    return original.call(this, params);
                owner.metrics[kind]++;
                const result = original.call(this, {...params, duration,
                    mode: Clutter.AnimationMode.EASE_OUT_CUBIC});
                for (const property of GEOMETRY) {
                    if (property in params)
                        motionCurve(this.get_transition(property.replaceAll('_', '-')),
                            kind === 'minimize' || kind === 'restore' || kind === 'resize');
                }
                return result;
            });
        this._injections.overrideMethod(OverviewAdjustment.prototype, 'ease', original =>
            function (value, params) {
                if (!motionEnabled() || !(params.duration > 0))
                    return original.call(this, value, params);
                owner.metrics.overview++;
                const result = original.call(this, value, {...params, duration: 440});
                motionCurve(this.get_transition('value'), true);
                return result;
            });
        this._injections.overrideMethod(MonitorGroup.prototype, 'ease_property', original =>
            function (property, value, params) {
                if (property !== 'progress' || !motionEnabled() || !(params.duration > 0))
                    return original.call(this, property, value, params);
                owner.metrics.workspace++;
                const result = original.call(this, property, value, {...params, duration: 460});
                motionCurve(this.get_transition(property), true);
                return result;
            });
    }

    disable() {
        this.ready = false;
        this._contrastGeneration = null;
        if (this._contrastFrameId)
            global.stage.disconnect(this._contrastFrameId);
        this._contrastFrameId = 0;
        for (const entry of global.blur_my_shell?._popup?.surfaces.values() ?? [])
            entry.target.remove_style_class_name('erhai-glass-light');
        const popup = global.blur_my_shell?._popup;
        if (popup?.enabled) {
            for (const [target] of [...popup.surfaces]) {
                if (surface(target))
                    popup.destroy_blur(target);
            }
        }
        this._injections.clear();
        this._injections = null;
        if (popup?.enabled) {
            for (const child of Main.uiGroup.get_children())
                popup.try_blur(child);
        }
    }
}
