import {describe, test, expect} from 'vitest';
import {ColorMode} from './color_mode';

describe('ColorMode blend presets', () => {
    test('multiply preserves destination alpha', () => {
        expect(ColorMode.multiply.blendFunction).toEqual([0x0306, 0x0000, 0x0000, 0x0001]);
    });

    test('screen preserves destination alpha', () => {
        expect(ColorMode.screen.blendFunction).toEqual([0x0001, 0x0301, 0x0000, 0x0001]);
    });
});