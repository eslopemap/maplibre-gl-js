import {Color} from '@maplibre/maplibre-gl-style-spec';

import type {BlendFuncType, ColorMaskType} from './types';

const ZERO = 0x0000;
const ONE = 0x0001;
const SRC_COLOR = 0x0300;
const ONE_MINUS_SRC_COLOR = 0x0301;
const DST_COLOR = 0x0306;
const SRC_ALPHA = 0x0302;
const ONE_MINUS_SRC_ALPHA = 0x0303;

export class ColorMode {
    blendFunction: BlendFuncType;
    blendColor: Color;
    mask: ColorMaskType;

    constructor(blendFunction: BlendFuncType, blendColor: Color, mask: ColorMaskType) {
        this.blendFunction = blendFunction;
        this.blendColor = blendColor;
        this.mask = mask;
    }

    static Replace: BlendFuncType;

    static disabled: Readonly<ColorMode>;
    static unblended: Readonly<ColorMode>;
    static alphaBlended: Readonly<ColorMode>;
    static multiply: Readonly<ColorMode>;
    static softMultiply: Readonly<ColorMode>;
    static screen: Readonly<ColorMode>;
    /**
     * Multiply blend for draping premultiplied-alpha FBO textures onto the screen.
     * RGB: result = src_premult × dst + dst × (1 - src_alpha)
     *    = dst × (src_rgb×alpha + 1 - alpha)  — correct alpha-aware multiply.
     * Alpha: preserved from destination.
     */
    static multiplyDrape: Readonly<ColorMode>;
    static softMultiplyDrape: Readonly<ColorMode>;
    /**
     * Screen blend for draping premultiplied-alpha FBO textures onto the screen.
     * RGB: result = src_premult + dst × (1 - src_premult)
     * For premultiplied content this is the same blend func as regular screen.
     * Alpha: preserved from destination.
     */
    static screenDrape: Readonly<ColorMode>;
}

ColorMode.Replace = [ONE, ZERO, ONE, ZERO];

ColorMode.disabled = new ColorMode(ColorMode.Replace, Color.transparent, [false, false, false, false]);
ColorMode.unblended = new ColorMode(ColorMode.Replace, Color.transparent, [true, true, true, true]);
ColorMode.alphaBlended = new ColorMode([ONE, ONE_MINUS_SRC_ALPHA, ONE, ONE_MINUS_SRC_ALPHA], Color.transparent, [true, true, true, true]);
ColorMode.multiply = new ColorMode([DST_COLOR, ZERO, ZERO, ONE], Color.transparent, [true, true, true, true]);
ColorMode.softMultiply = new ColorMode([DST_COLOR, SRC_COLOR, ZERO, ONE], Color.transparent, [true, true, true, true]);
ColorMode.screen = new ColorMode([ONE, ONE_MINUS_SRC_COLOR, ZERO, ONE], Color.transparent, [true, true, true, true]);
ColorMode.multiplyDrape = new ColorMode([DST_COLOR, ONE_MINUS_SRC_ALPHA, ZERO, ONE], Color.transparent, [true, true, true, true]);
ColorMode.softMultiplyDrape = new ColorMode([DST_COLOR, SRC_COLOR, ZERO, ONE], Color.transparent, [true, true, true, true]);
ColorMode.screenDrape = new ColorMode([ONE, ONE_MINUS_SRC_COLOR, ZERO, ONE], Color.transparent, [true, true, true, true]);
