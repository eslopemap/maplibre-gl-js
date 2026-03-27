import {describe, test, expect} from 'vitest';
import terrainAnalysisFrag from './terrain_analysis.fragment.glsl.g';

describe('terrain_analysis fragment shader', () => {
    test('premultiplied path outputs rampColor directly without double-multiplying alpha', () => {
        // The premultiplied path should output `fragColor=rampColor` directly.
        // rampColor = u_opacity * texture(...) is already premultiplied:
        //   rgb = opacity * color.rgb, a = opacity * color.a
        // A previous bug had `fragColor=vec4(rampColor.rgb*rampColor.a,rampColor.a)`
        // which double-premultiplied, squaring opacity (e.g., 0.45² = 0.2025).
        expect(terrainAnalysisFrag).toContain(
            'if (u_is_premultiplied > 0.5) {fragColor=rampColor;}'
        );
        expect(terrainAnalysisFrag).not.toContain(
            'rampColor.rgb*rampColor.a'
        );
    });

    test('non-premultiplied path uses blend_neutral mix', () => {
        expect(terrainAnalysisFrag).toContain(
            'fragColor=vec4(mix(vec3(u_blend_neutral),rampColor.rgb,rampColor.a),rampColor.a)'
        );
    });
});
