import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';
import Rsvg from 'gi://Rsvg';
import {getSvgPath} from './shape/index.js';

const ContinuousDrawing = GObject.registerClass(class ContinuousDrawing extends St.DrawingArea {
    _init() {
        super._init({reactive: false});
        this.connect('repaint', () => {
            if (!this.colors)
                return;
            const context = this.get_context();
            const [width, height] = this.get_surface_size();
            const {background, border, radius, borderWidth} = this.colors;
            if (width <= 0 || height <= 0) {
                context.$dispose();
                return;
            }
            const key = [width, height, background.to_string(), border.to_string(), radius, borderWidth].join(':');
            if (this._svgKey !== key) {
                const path = getSvgPath({width, height, cornerRadius: radius, cornerSmoothing: 0.6});
                const inner = getSvgPath({width: Math.max(0.1, width - borderWidth),
                    height: Math.max(0.1, height - borderWidth),
                    cornerRadius: Math.max(0, radius - borderWidth / 2), cornerSmoothing: 0.6});
                const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
                <path d="${path}" fill="rgb(${background.red},${background.green},${background.blue})"
                    fill-opacity="${background.alpha / 255}"/>
                <path d="${inner}" transform="translate(${borderWidth / 2},${borderWidth / 2})"
                    fill="none" stroke="rgb(${border.red},${border.green},${border.blue})"
                    stroke-opacity="${border.alpha / 255}" stroke-width="${borderWidth}"/>
                </svg>`;
                this._svg = Rsvg.Handle.new_from_data(new TextEncoder().encode(svg));
                this._svgKey = key;
            }
            this._svg.render_document(context,
                new Rsvg.Rectangle({x: 0, y: 0, width, height}));
            context.$dispose();
        });
    }
});

export class ContinuousSurface {
    constructor(surface) {
        this.target = surface.target;
        this.drawing = new ContinuousDrawing();
        this.drawing.add_constraint(new Clutter.BindConstraint({source: surface.actor,
            coordinate: Clutter.BindCoordinate.ALL}));
        surface.parent.insert_child_above(this.drawing, surface.actor);
        this.opacity = surface.actor.bind_property('opacity', this.drawing, 'opacity',
            GObject.BindingFlags.SYNC_CREATE);
        this.visible = surface.actor.bind_property('visible', this.drawing, 'visible',
            GObject.BindingFlags.SYNC_CREATE);
        this.drawing.fixed_position_set = true;
        this.transforms = ['transform', 'translation-x', 'translation-y', 'scale-x', 'scale-y'].map(property =>
            surface.actor.bind_property(property, this.drawing, property, GObject.BindingFlags.SYNC_CREATE));
        this.styleId = this.target.connect('style-changed', () => this.syncStyle());
        this.destroyId = this.target.connect('destroy', () => { this.target = null; });
        this.target.add_style_class_name('erhai-continuous');
        this.syncStyle();
    }

    syncStyle() {
        if (this.syncing || !this.target)
            return;
        this.syncing = true;
        const node = this.target.get_theme_node();
        const colors = {background: node.lookup_color('-erhai-background-color', true)[1],
            border: node.lookup_color('-erhai-border-color', true)[1],
            borderWidth: node.get_border_width(St.Side.TOP),
            radius: node.get_border_radius(St.Corner.TOPLEFT)};
        const previous = this.drawing.colors;
        if (!previous || !previous.background.equal(colors.background) || !previous.border.equal(colors.border)
            || previous.borderWidth !== colors.borderWidth || previous.radius !== colors.radius) {
            this.drawing.colors = colors;
            this.drawing.queue_repaint();
        }
        this.syncing = false;
    }

    destroy() {
        this.opacity.unbind();
        this.visible.unbind();
        this.transforms.forEach(binding => binding.unbind());
        if (this.target) {
            this.target.disconnect(this.styleId);
            this.target.disconnect(this.destroyId);
            this.target.remove_style_class_name('erhai-continuous');
        }
        this.drawing.destroy();
    }
}
