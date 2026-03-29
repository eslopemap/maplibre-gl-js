#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D u_image;
uniform vec4 u_unpack;
uniform vec2 u_dimension;
uniform sampler2D u_elevation_stops;
uniform sampler2D u_color_stops;
uniform int u_color_ramp_size;
uniform float u_opacity;

in vec2 v_pos;

float getDecodedElevation(vec2 coord) {
    // Convert encoded elevation value to meters
    vec4 data = texture(u_image, coord) * 255.0;
    data.a = -1.0;
    return dot(data, u_unpack);
}

float getElevation(vec2 coord) {
    // Manually bilinearly filter the decoded elevation to avoid 8-bit precision errors
    vec2 size = u_dimension;
    vec2 tc = coord * size - 0.5;
    vec2 f = fract(tc);

    vec2 tc00 = (floor(tc) + 0.5) / size;
    vec2 epsilon = 1.0 / size;

    float h00 = getDecodedElevation(tc00);
    float h10 = getDecodedElevation(tc00 + vec2(epsilon.x, 0.0));
    float h01 = getDecodedElevation(tc00 + vec2(0.0, epsilon.y));
    float h11 = getDecodedElevation(tc00 + vec2(epsilon.x, epsilon.y));

    float h0 = mix(h00, h10, f.x);
    float h1 = mix(h01, h11, f.x);
    return mix(h0, h1, f.y);
}

float getElevationStop(int stop) {
    // Convert encoded elevation value to meters
    float x = (float(stop)+0.5)/float(u_color_ramp_size);
    vec4 data = texture(u_elevation_stops, vec2(x, 0)) * 255.0;
    data.a = -1.0;
    return dot(data, u_unpack);
}

void main() {
    float el = getElevation(v_pos);

    // Binary search
    int r = (u_color_ramp_size - 1);
    int l = 0;
    float el_l = getElevationStop(l);
    float el_r = getElevationStop(r);
    while(r - l > 1)
    {
        int m = (r + l) / 2;
        float el_m = getElevationStop(m);
        if(el < el_m)
        {
            r = m;
            el_r = el_m;
        }
        else
        {
            l = m;
            el_l = el_m;
        }
    }

    float x = (float(l) + (el - el_l) / (el_r - el_l) + 0.5)/float(u_color_ramp_size);
    fragColor = u_opacity*texture(u_color_stops, vec2(x, 0));

#ifdef OVERDRAW_INSPECTOR
    fragColor = vec4(1.0);
#endif
}
