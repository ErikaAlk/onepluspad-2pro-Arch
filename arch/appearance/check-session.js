import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';

export const METRICS = {};
const assert = (value, message) => { if (!value) throw new Error(message); };
async function until(predicate, message) {
    const deadline = GLib.get_monotonic_time() + 10000000;
    while (!predicate()) {
        assert(GLib.get_monotonic_time() < deadline, message);
        await new Promise(resolve => {
            const signal = global.stage.connect('after-paint', () => {
                global.stage.disconnect(signal);
                resolve();
            });
            global.stage.queue_redraw();
        });
    }
}
function checkMaterial(entry, motion) {
    assert(motion._continuous.has(entry), '缺少连续圆角材质');
    const effects = entry.pipeline.effects;
    const params = type => effects.find(effect => effect._bms_effect_type === type)?._bms_effect_params;
    assert(params('luminosity')?.saturation_multiplicator === 1.05, '饱和度发生变化');
    assert(params('refraction')?.blur_radius === 14, '折射模糊半径发生变化');
    assert(params('refraction')?.rgb_fringing === 0.03, '色散发生变化');
    assert(params('refraction')?.specular_strength === 0.10, '高光强度发生变化');
    assert(params('noise')?.noise === 0.025, '噪点发生变化');
}
export async function run() {
    await Scripting.waitLeisure();
    for (const uuid of ['blur-my-shell@aunetx', 'lintel@topbar', 'erhai-motion@erhai.local', 'glasslight']) {
        Main.extensionManager.enableExtension(uuid);
        await until(() => Main.extensionManager.lookup(uuid)?.state === 1,
            `${uuid} 加载失败：${Main.extensionManager.lookup(uuid)?.error}`);
    }
    const motion = Main.extensionManager.lookup('erhai-motion@erhai.local').stateObj;
    const popup = global.blur_my_shell._popup;
    const control = Main.panel.statusArea['lintel-control-center'];
    control.menu.open();
    await until(() => [...popup.surfaces.keys()].filter(actor => actor.mapped &&
        actor.has_style_class_name?.('lintel-cc-tile')).length >= 4, '控制中心玻璃卡片未绘制');
    for (const [actor, entry] of popup.surfaces) {
        if (actor.mapped && actor.has_style_class_name?.('lintel-cc-tile'))
            checkMaterial(entry, motion);
    }
    control.menu.close();
    const launcher = Main.extensionManager.lookup('glasslight').stateObj;
    launcher._show('apps');
    await until(() => launcher._mainSurface.mapped && popup.surfaces.has(launcher._mainSurface), '启动台玻璃未绘制');
    checkMaterial(popup.surfaces.get(launcher._mainSurface), motion);
    launcher._hide(true);
    await until(() => Main.modalCount === 0, '启动台关闭后未释放模态输入');
    for (const uuid of ['glasslight', 'erhai-motion@erhai.local', 'lintel@topbar', 'blur-my-shell@aunetx']) {
        Main.extensionManager.disableExtension(uuid);
        await until(() => Main.extensionManager.lookup(uuid)?.state !== 1, `${uuid} 停用失败`);
    }
    print('APPEARANCE_SESSION_PASSED：控制中心和启动台的真实绘制参数一致');
}
