#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D u_image;
uniform vec4 u_unpack;
uniform sampler2D u_scalar_stops;
uniform sampler2D u_color_stops;
uniform int u_color_ramp_size;
uniform float u_opacity;
uniform vec2 u_latrange;
uniform vec2 u_dimension;
uniform float u_zoom;
uniform int u_attribute; // 0 = elevation, 1 = slope, 2 = aspect
uniform int u_step_mode; // 0 = interpolate, 1 = step (discrete bands)
uniform float u_is_premultiplied;
uniform float u_blend_neutral;

in vec2 v_pos;

#define PI 3.141592653589793

#define ATTR_ELEVATION 0
#define ATTR_SLOPE     1
#define ATTR_ASPECT    2

float getDecodedElevation(vec2 coord) {
    vec4 data = texture(u_image, coord) * 255.0;
    data.a = -1.0;
    return dot(data, u_unpack);
}

// Manually bilinearly filter the decoded elevation to avoid 8-bit hardware 
// filtering precision errors on the encoded RGB values (which causes artifacts 
// at integer coordinate boundaries like 256m, 512m, 1024m).
float getElevation(vec2 coord) {
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

float getScalarStop(int stop) {
    float x = (float(stop)+0.5)/float(u_color_ramp_size);
    vec4 data = texture(u_scalar_stops, vec2(x, 0));
    if (u_attribute == ATTR_ELEVATION) {
        // Elevation is packed using the DEM encoding: decode from RGBA
        data = data * 255.0;
        data.a = -1.0;
        return dot(data, u_unpack);
    } else if (u_attribute == ATTR_ASPECT) {
        // Aspect stored as: R,G channels = aspect / 360.0 (high,low bytes for precision)
        return (data.r * 256.0 + data.g) * (360.0 / 256.0);
    } else {
        // Slope stored as: R channel = slope / 90.0 (normalized to 0-1 range)
        return data.r * 90.0;
    }
}

// Compute the surface normal derivatives using Horn's (1981) algorithm
// Returns dz/dx and dz/dy in real-world units (meters/meter)
vec2 computeNormalDeriv() {
    vec2 epsilon = 1.0 / u_dimension;
    float tileSize = u_dimension.x - 2.0;

    // Sample 3x3 neighborhood
    float a = getElevation(v_pos + vec2(-epsilon.x, -epsilon.y));
    float b = getElevation(v_pos + vec2(0, -epsilon.y));
    float c = getElevation(v_pos + vec2(epsilon.x, -epsilon.y));
    float d = getElevation(v_pos + vec2(-epsilon.x, 0));
    float f = getElevation(v_pos + vec2(epsilon.x, 0));
    float g = getElevation(v_pos + vec2(-epsilon.x, epsilon.y));
    float h = getElevation(v_pos + vec2(0, epsilon.y));
    float i = getElevation(v_pos + vec2(epsilon.x, epsilon.y));

    // Horn algorithm: raw pixel-space derivatives
    float dzdx = (c + 2.0*f + i) - (a + 2.0*d + g);
    float dzdy = (g + 2.0*h + i) - (a + 2.0*b + c);

    // Convert from pixel-space to meter-space derivatives
    // 8 * cellsize = 8 * 40075016.6855785 / (tileSize * 2^zoom)
    //             = pow(2, 28.2562 - zoom) / tileSize
    vec2 deriv = vec2(dzdx, dzdy) * tileSize / pow(2.0, 28.2562 - u_zoom);

    // Mercator is conformal: both axes have the same scale distortion at any latitude.
    // Divide both derivatives by cos(lat) to convert from Mercator-pixel to ground units.
    float lat = (u_latrange[0] - u_latrange[1]) * (1.0 - v_pos.y) + u_latrange[1];
    deriv /= cos(radians(lat));

    return deriv;
}

void main() {
    float scalar;

    if (u_attribute == ATTR_ELEVATION) {
        scalar = getElevation(v_pos);
    } else {
        vec2 deriv = computeNormalDeriv();

        if (u_attribute == ATTR_SLOPE) {
            // Slope angle in degrees (0-90)
            float gradient = length(deriv);
            float slope_radians = atan(gradient);
            scalar = clamp(slope_radians * (180.0 / PI), 0.0, 90.0);
        } else if (u_attribute == ATTR_ASPECT) {
            // Aspect: compass direction the slope faces (0-360, 0=north, clockwise)
            // atan(dzdy, -dzdx) gives angle from east, counter-clockwise
            // Convert to compass bearing: north=0, clockwise
            float aspect_rad = atan(deriv.y, -deriv.x);
            scalar = degrees(aspect_rad);
            // Convert from math angle to compass bearing
            scalar = mod(90.0 - scalar, 360.0);
            // Flat areas (no slope) get aspect = 0
            if (length(deriv) < 0.0001) {
                scalar = 0.0;
            }
        }
    }

    // Binary search for color ramp interpolation
    int r = (u_color_ramp_size - 1);
    int l = 0;
    float scalar_l = getScalarStop(l);
    float scalar_r = getScalarStop(r);
    while(r - l > 1)
    {
        int m = (r + l) / 2;
        float scalar_m = getScalarStop(m);
        if(scalar < scalar_m)
        {
            r = m;
            scalar_r = scalar_m;
        }
        else
        {
            l = m;
            scalar_l = scalar_m;
        }
    }

    float x;
    if (u_step_mode == 1) {
        // Step mode: snap to the left stop's color (discrete bands)
        x = (float(l) + 0.5) / float(u_color_ramp_size);
    } else {
        // Interpolate mode: blend between adjacent stops
        x = (float(l) + (scalar - scalar_l) / (scalar_r - scalar_l) + 0.5) / float(u_color_ramp_size);
    }
    vec4 rampColor = u_opacity * texture(u_color_stops, vec2(x, 0));
    if (u_is_premultiplied > 0.5) {
        // rampColor is already premultiplied: rgb = color * opacity, a = opacity
        fragColor = rampColor;
    } else {
        fragColor = vec4(mix(vec3(u_blend_neutral), rampColor.rgb, rampColor.a), rampColor.a);
    }

#ifdef OVERDRAW_INSPECTOR
    fragColor = vec4(1.0);
#endif
}
