// 与 figma-squircle 1.1.0 的 60% 平滑圆角参数一致（MIT，Tien Pham）。
void erhaiCornerParams(float radius, float budget, out float extent,
                      out float a, out float b, out float c, out float d, out float arc) {
    float smoothing = clamp(budget / max(radius, 0.001) - 1.0, 0.0, 0.6);
    extent = (1.0 + smoothing) * radius;
    arc = sin(radians(45.0 * (1.0 - smoothing))) * radius * sqrt(2.0);
    float beta = radians(45.0 * smoothing);
    c = radius * tan(beta * 0.5) * cos(beta);
    d = c * tan(beta);
    b = (extent - arc - c - d) / 3.0;
    a = 2.0 * b;
}

vec2 erhaiBezier(float t, vec2 p0, vec2 p1, vec2 p2, vec2 p3) {
    float u = 1.0 - t;
    return u * u * u * p0 + 3.0 * u * u * t * p1
        + 3.0 * u * t * t * p2 + t * t * t * p3;
}

float erhaiCurveInset(float coordinate, float radius, float extent,
                     float a, float b, float c, float d, float arc) {
    if (coordinate >= extent)
        return 0.0;
    if (coordinate <= d + arc)
        return radius - sqrt(max(0.0, radius * radius - (radius - coordinate) * (radius - coordinate)));
    float low = 0.0;
    float high = 1.0;
    for (int index = 0; index < 10; index++) {
        float t = (low + high) * 0.5;
        float x = erhaiBezier(t, vec2(extent, 0.0), vec2(extent - a, 0.0),
            vec2(extent - a - b, 0.0), vec2(d + arc, d)).x;
        if (x > coordinate)
            low = t;
        else
            high = t;
    }
    return erhaiBezier((low + high) * 0.5, vec2(extent, 0.0), vec2(extent - a, 0.0),
        vec2(extent - a - b, 0.0), vec2(d + arc, d)).y;
}

float erhaiSmoothDistance(vec2 point, vec2 halfSize, float radius) {
    radius = clamp(radius, 0.0, min(halfSize.x, halfSize.y));
    vec2 inward = halfSize - abs(point);
    if (radius < 0.001)
        return -min(inward.x, inward.y);
    float extent, a, b, c, d, arc;
    erhaiCornerParams(radius, min(halfSize.x, halfSize.y), extent, a, b, c, d, arc);
    if (max(inward.x, inward.y) >= extent)
        return -min(inward.x, inward.y);
    vec2 p = inward.x >= inward.y ? inward : inward.yx;
    if (p.x <= d + arc)
        return length(p - vec2(radius)) - radius;
    vec2 p0 = vec2(extent, 0.0);
    vec2 p1 = vec2(extent - a, 0.0);
    vec2 p2 = vec2(extent - a - b, 0.0);
    vec2 p3 = vec2(d + arc, d);
    float t = clamp((extent - p.x) / max(extent - p3.x, 0.001), 0.0, 1.0);
    for (int index = 0; index < 6; index++) {
        vec2 position = erhaiBezier(t, p0, p1, p2, p3);
        vec2 derivative = 3.0 * ((1.0-t)*(1.0-t)*(p1-p0)
            + 2.0*(1.0-t)*t*(p2-p1) + t*t*(p3-p2));
        vec2 second = 6.0 * ((1.0-t)*(p2-2.0*p1+p0) + t*(p3-2.0*p2+p1));
        float divisor = dot(derivative, derivative) + dot(position-p, second);
        if (abs(divisor) > 0.00001)
            t = clamp(t - dot(position-p, derivative) / divisor, 0.0, 1.0);
    }
    float distance = length(p-erhaiBezier(t, p0, p1, p2, p3));
    float boundary = erhaiCurveInset(p.x, radius, extent, a, b, c, d, arc);
    return p.y < boundary ? distance : -distance;
}
