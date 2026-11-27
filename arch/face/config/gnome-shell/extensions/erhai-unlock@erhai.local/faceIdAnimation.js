import Cairo from 'cairo';

// 数据取自用户提供的 Face ID Unlock Successful_lottie.svg：200×200 viewBox，一次播放 2 秒。
// 关键帧时间沿用 SVG 中占总时长的比例，路径点逐项照抄，插值规则同 SMIL。
export const DURATION = 2;
export const SIZE = 200;
// 0.133333 之前所有属性保持初值，识别期间停在这一段
export const STATIC_UNTIL = 0.133333 * DURATION;

const COLOR = [0x4c / 255, 0xbe / 255, 0xff / 255];
const LINEAR = [0, 0, 1, 1];
const MORPH = [0.6, 0, 0.833, 0.833];
const FLIP = [0.167, 0.167, 0.5, 1];

// 每个形状为起点加 8 段三次贝塞尔：x0, y0, (c1x, c1y, c2x, c2y, x, y) × 8，末尾闭合
const SQUARE_SHAPE = [35.16, 73.973,
    35.16, 73.973, -35.16, 73.973, -35.16, 73.973,
    -56.596, 73.973, -73.973, 56.596, -73.973, 35.16,
    -73.973, 35.16, -73.973, -35.16, -73.973, -35.16,
    -73.973, -56.596, -56.596, -73.973, -35.16, -73.973,
    -35.16, -73.973, 35.16, -73.973, 35.16, -73.973,
    56.596, -73.973, 73.973, -56.596, 73.973, -35.16,
    73.973, -35.16, 73.973, 35.16, 73.973, 35.16,
    73.973, 56.596, 56.596, 73.973, 35.16, 73.973];
const CIRCLE_SHAPE = [0, 72.5,
    0, 72.5, 0, 72.5, 0, 72.5,
    -40.041, 72.5, -72.5, 40.041, -72.5, 0,
    -72.5, 0, -72.5, 0, -72.5, 0,
    -72.5, -40.041, -40.041, -72.5, 0, -72.5,
    0, -72.5, 0, -72.5, 0, -72.5,
    40.041, -72.5, 72.5, -40.041, 72.5, 0,
    72.5, 0, 72.5, 0, 72.5, 0,
    72.5, 40.041, 40.041, 72.5, 0, 72.5];
const FLIPPED_SHAPE = [-30.759, 67.141,
    -30.759, 67.141, -30.759, 67.141, -30.759, 67.141,
    5.975, 84.289, 49.524, 68.13, 66.512, 31.049,
    66.512, 31.049, 66.512, 31.049, 66.512, 31.049,
    83.5, -6.032, 67.493, -49.993, 30.759, -67.141,
    30.759, -67.141, 30.759, -67.141, 30.759, -67.141,
    -5.975, -84.289, -49.524, -68.13, -66.512, -31.049,
    -66.512, -31.049, -66.512, -31.049, -66.512, -31.049,
    -83.5, 6.032, -67.493, 49.993, -30.759, 67.141];
const GHOST_SHAPE = [31.049, 67.141,
    31.049, 67.141, 31.049, 67.141, 31.049, 67.141,
    -6.032, 84.289, -49.993, 68.13, -67.141, 31.049,
    -67.141, 31.049, -67.141, 31.049, -67.141, 31.049,
    -84.289, -6.032, -68.13, -49.993, -31.049, -67.141,
    -31.049, -67.141, -31.049, -67.141, -31.049, -67.141,
    6.032, -84.289, 49.993, -68.13, 67.141, -31.049,
    67.141, -31.049, 67.141, -31.049, 67.141, -31.049,
    84.289, 6.032, 68.13, 49.993, 31.049, 67.141];

// 四个角各取圆角矩形周长的一段，起点偏移分别对应 SVG 的 i1～i4
const CORNER_OFFSETS = [-36.94, -11.67, -86.94, -61.67];
const CORNER_SHAPE = {
    times: [0, 0.166667, 0.3, 0.5, 1],
    values: [SQUARE_SHAPE, SQUARE_SHAPE, CIRCLE_SHAPE, FLIPPED_SHAPE, FLIPPED_SHAPE],
    splines: [LINEAR, MORPH, FLIP, LINEAR],
};
const CORNER_DASH = {
    times: [0, 0.166667, 0.3, 1],
    values: [14.5, 14.5, 25, 25],
    splines: [LINEAR, MORPH, LINEAR],
};
const CORNER_SHIFT = {
    times: [0, 0.166667, 0.3, 1],
    values: [0, 0, 5, 5],
    splines: [LINEAR, MORPH, LINEAR],
};

const GHOST_VISIBLE = 0.299583;
const GHOST_ROTATION = {
    times: [0, 0.3, 0.5, 1],
    values: [0, 0, -180, -180],
    splines: [LINEAR, FLIP, LINEAR],
};
const GHOST_PATH = {
    times: [0, 0.3, 0.5, 1],
    values: [GHOST_SHAPE, GHOST_SHAPE, FLIPPED_SHAPE, FLIPPED_SHAPE],
    splines: [LINEAR, FLIP, LINEAR],
};

const CHECK_VISIBLE = 0.400007;
const CHECK_PATH = [-38.75, 15.5,
    -38.75, 15.5, -18.25, 39.75, -18.25, 39.75,
    -18.25, 39.75, 32.5, -15, 32.5, -15];
// SVG 中勾号的描边进度按 1/240 总时长逐帧采样，calcMode 为 linear
const CHECK_DASH = {
    times: [0, 0.4, 0.404167, 0.408333, 0.4125, 0.416667, 0.420833, 0.425, 0.429167,
        0.433333, 0.4375, 0.441667, 0.445833, 0.45, 0.454167, 0.458333, 0.4625, 0.466667,
        0.470833, 0.475, 0.479167, 0.483333, 0.4875, 0.491667, 0.495833, 0.5, 0.508333,
        0.5125, 0.520833, 0.529167, 0.533333, 0.541667, 0.55, 1],
    values: [0, 0, 3.69, 9.47, 17.31, 26.24, 35, 42.87, 49.74, 55.69, 60.86, 65.39, 69.38,
        72.91, 76.05, 78.87, 81.39, 83.65, 85.69, 87.52, 89.17, 90.66, 92, 93.2, 94.27,
        95.23, 96.83, 97.48, 98.54, 99.28, 99.55, 99.89, 100, 100],
};

const FEATURES_HIDDEN = 0.299583;
const FEATURE_OPACITY = {
    times: [0, 0.133333, 0.283333, 1],
    values: [1, 1, 0, 0],
    splines: [LINEAR, MORPH, LINEAR],
};
const FEATURE_SCALE = {
    times: [0, 0.133333, 0.283334, 1],
    values: [1, 1, 0.6, 0.6],
    splines: [LINEAR, MORPH, LINEAR],
};
// 眼、鼻、嘴四条子路径，每条为起点加若干段三次贝塞尔
const FEATURE_PATHS = [
    [-30.5, -13.875, -30.5, -13.875, -30.5, 2, -30.5, 2],
    [28.5, -13.875, 28.5, -13.875, 28.5, 2, 28.5, 2],
    [-0.5, -5.375, -0.5, -5.375, -0.25, 28, -0.25, 28, -0.25, 28, -8.25, 28, -8.25, 28],
    [-29.5, 54.5, -29.5, 54.5, -2, 72, 26.5, 55.25],
];

const GAUSS = [[-0.9602898564975363, 0.1012285362903763], [-0.7966664774136267, 0.2223810344533745],
    [-0.5255324099163290, 0.3137066458778873], [-0.1834346424956498, 0.3626837833783620],
    [0.1834346424956498, 0.3626837833783620], [0.5255324099163290, 0.3137066458778873],
    [0.7966664774136267, 0.2223810344533745], [0.9602898564975363, 0.1012285362903763]];

function bezier(p1, p2, s) {
    const r = 1 - s;
    return 3 * r * r * s * p1 + 3 * r * s * s * p2 + s * s * s;
}

// keySplines 给出的三次贝塞尔：先由进度 x 反解参数，再取对应 y
function ease([x1, y1, x2, y2], x) {
    let low = 0, high = 1;
    for (let step = 0; step < 48; step++) {
        const middle = (low + high) / 2;
        if (bezier(x1, x2, middle) < x)
            low = middle;
        else
            high = middle;
    }
    return bezier(y1, y2, (low + high) / 2);
}

function lerp(from, to, t) {
    if (typeof from === 'number')
        return from + (to - from) * t;
    return from.map((value, index) => value + (to[index] - value) * t);
}

function sample({times, values, splines}, progress) {
    let index = times.length - 2;
    while (index > 0 && progress < times[index])
        index--;
    const local = Math.min(1, Math.max(0, (progress - times[index]) / (times[index + 1] - times[index])));
    return lerp(values[index], values[index + 1], splines ? ease(splines[index], local) : local);
}

function segmentLength(x0, y0, x1, y1, x2, y2, x3, y3) {
    let length = 0;
    for (const [node, weight] of GAUSS) {
        const s = (node + 1) / 2, r = 1 - s;
        const dx = 3 * (r * r * (x1 - x0) + 2 * r * s * (x2 - x1) + s * s * (x3 - x2));
        const dy = 3 * (r * r * (y1 - y0) + 2 * r * s * (y2 - y1) + s * s * (y3 - y2));
        length += weight * Math.hypot(dx, dy);
    }
    return length / 2;
}

function pathLength(points) {
    let length = 0;
    for (let index = 2; index < points.length; index += 6) {
        length += segmentLength(points[index - 2], points[index - 1], points[index], points[index + 1],
            points[index + 2], points[index + 3], points[index + 4], points[index + 5]);
    }
    return length;
}

const CHECK_LENGTH = pathLength(CHECK_PATH);

function trace(cr, points) {
    cr.moveTo(points[0], points[1]);
    for (let index = 2; index < points.length; index += 6) {
        cr.curveTo(points[index], points[index + 1], points[index + 2], points[index + 3],
            points[index + 4], points[index + 5]);
    }
}

function stroke(cr, width, opacity) {
    cr.setSourceRGBA(...COLOR, opacity);
    cr.setLineWidth(width);
    cr.stroke();
}

// pathLength="100"：虚线长度按当前路径总长换算成实际长度
function dash(cr, length, on, gap, offset) {
    const unit = length / 100;
    cr.setDash([on * unit, gap * unit], offset * unit);
}

export function paint(cr, time) {
    const progress = Math.min(1, Math.max(0, time / DURATION));

    // SVG 默认斜接上限为 4，Cairo 默认为 10
    cr.setMiterLimit(4);
    cr.save();
    cr.translate(100, 100);
    cr.setLineCap(Cairo.LineCap.ROUND);
    const corner = sample(CORNER_SHAPE, progress);
    const cornerLength = pathLength(corner);
    const cornerDash = sample(CORNER_DASH, progress);
    const cornerShift = sample(CORNER_SHIFT, progress);
    for (const offset of CORNER_OFFSETS) {
        trace(cr, corner);
        cr.closePath();
        dash(cr, cornerLength, cornerDash, 100.001 - cornerDash, offset + cornerShift);
        stroke(cr, 9, 1);
    }
    cr.restore();

    if (progress >= GHOST_VISIBLE) {
        cr.save();
        cr.translate(100, 100);
        cr.rotate(sample(GHOST_ROTATION, progress) * Math.PI / 180);
        trace(cr, sample(GHOST_PATH, progress));
        cr.closePath();
        stroke(cr, 9, 0.5);
        cr.restore();
    }

    if (progress >= CHECK_VISIBLE) {
        cr.save();
        cr.translate(102.125, 92.125);
        cr.setLineCap(Cairo.LineCap.ROUND);
        cr.setLineJoin(Cairo.LineJoin.ROUND);
        trace(cr, CHECK_PATH);
        // SVG 的虚线周期只比路径长 0.001%，Cairo 以 24.8 定点坐标量长度，误差会超过这点余量，
        // 在勾号末端多出一个零长线段的圆头；勾号只有一段虚线，间隔取两倍路径长
        dash(cr, CHECK_LENGTH, sample(CHECK_DASH, progress), 200, 0);
        stroke(cr, 10, 1);
        cr.restore();
    }

    if (progress < FEATURES_HIDDEN) {
        cr.save();
        cr.translate(100, 104.5);
        const scale = sample(FEATURE_SCALE, progress);
        cr.scale(scale, scale);
        cr.translate(1, -15.815 - 8.5);
        cr.setLineCap(Cairo.LineCap.ROUND);
        cr.setLineJoin(Cairo.LineJoin.ROUND);
        for (const points of FEATURE_PATHS)
            trace(cr, points);
        stroke(cr, 10, sample(FEATURE_OPACITY, progress));
        cr.restore();
    }
}
