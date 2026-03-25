import {describe, test, expect} from 'vitest';
import {ColorMode} from './color_mode';

const GL_ZERO = 0x0000;
const GL_ONE = 0x0001;
const GL_ONE_MINUS_SRC_COLOR = 0x0301;
const GL_DST_COLOR = 0x0306;
const GL_ONE_MINUS_SRC_ALPHA = 0x0303;

describe('ColorMode blend presets', () => {
    test('multiply preserves destination alpha', () => {
        expect(ColorMode.multiply.blendFunction).toEqual([GL_DST_COLOR, GL_ZERO, GL_ZERO, GL_ONE]);
    });

    test('screen preserves destination alpha', () => {
        expect(ColorMode.screen.blendFunction).toEqual([GL_ONE, GL_ONE_MINUS_SRC_COLOR, GL_ZERO, GL_ONE]);
    });

    test('multiplyDrape uses alpha-aware multiply for premultiplied FBO textures', () => {
        // RGB: result = src_premult × dst + dst × (1 - src_alpha) = dst × (src_rgb×α + 1 - α)
        // Alpha: preserved from destination
        expect(ColorMode.multiplyDrape.blendFunction).toEqual([GL_DST_COLOR, GL_ONE_MINUS_SRC_ALPHA, GL_ZERO, GL_ONE]);
        expect(ColorMode.multiplyDrape.mask).toEqual([true, true, true, true]);
    });

    test('multiplyDrape is identity when source alpha is 0 (transparent FBO region)', () => {
        // With src = (0, 0, 0, 0): result_rgb = 0 × dst + dst × (1 - 0) = dst
        // The blend factors [DST_COLOR, ONE_MINUS_SRC_ALPHA] produce no change for transparent pixels
        const [srcFactor, dstFactor] = ColorMode.multiplyDrape.blendFunction;
        expect(srcFactor).toBe(GL_DST_COLOR);
        expect(dstFactor).toBe(GL_ONE_MINUS_SRC_ALPHA);
    });

    test('screen blend works against cleared FBO (no drape override needed)', () => {
        // Screen: result = src × 1 + dst × (1 - src_color)
        // Against cleared FBO (0,0,0,0): result = src + 0 = src (colors survive)
        // This is why screen does NOT need a drape-time override like multiply does
        const [srcFactor, dstFactor] = ColorMode.screen.blendFunction;
        expect(srcFactor).toBe(GL_ONE);
        expect(dstFactor).toBe(GL_ONE_MINUS_SRC_COLOR);
    });
});
