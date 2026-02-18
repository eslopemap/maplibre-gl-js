import {StyleLayer} from '../style_layer';

import properties, {type TerrainAnalysisPaintPropsPossiblyEvaluated} from './terrain_analysis_style_layer_properties.g';
import {type Transitionable, type Transitioning, type PossiblyEvaluated} from '../properties';

import type {TerrainAnalysisPaintProps} from './terrain_analysis_style_layer_properties.g';
import {Color, Interpolate, Step, ZoomConstantExpression, type LayerSpecification, type EvaluationContext, type StylePropertyExpression} from '@maplibre/maplibre-gl-style-spec';
import {warnOnce} from '../../util/util';
import {Texture} from '../../render/texture';
import {RGBAImage} from '../../util/image';
import {type Context} from '../../gl/context';
import {packDEMData} from '../../data/dem_data';

export const isTerrainAnalysisStyleLayer = (layer: StyleLayer): layer is TerrainAnalysisStyleLayer => layer instanceof TerrainAnalysisStyleLayer;

export type ScalarRamp = {scalarStops: Array<number>; colorStops: Array<Color>};
export type ScalarRampTextures = {scalarTexture: Texture; colorTexture: Texture};

export type TerrainAnalysisAttribute = 'elevation' | 'slope' | 'aspect';

export class TerrainAnalysisStyleLayer extends StyleLayer {
    colorRampExpression: StylePropertyExpression;
    scalarRampTextures: ScalarRampTextures;
    isStepMode: boolean;
    _transitionablePaint: Transitionable<TerrainAnalysisPaintProps>;
    _transitioningPaint: Transitioning<TerrainAnalysisPaintProps>;
    paint: PossiblyEvaluated<TerrainAnalysisPaintProps, TerrainAnalysisPaintPropsPossiblyEvaluated>;

    // For backward-compat with color-relief: override attribute and property names
    private _attributeOverride: TerrainAnalysisAttribute | null;
    private _opacityProperty: string;
    private _colorProperty: string;

    constructor(layer: LayerSpecification | any, globalState: Record<string, any>, attributeOverride?: TerrainAnalysisAttribute) {
        super(layer, properties, globalState);
        this._attributeOverride = attributeOverride || null;
        this._opacityProperty = 'terrain-analysis-opacity';
        this._colorProperty = 'terrain-analysis-color';
    }

    getAttributeType(): TerrainAnalysisAttribute {
        if (this._attributeOverride) {
            return this._attributeOverride;
        }
        return this.paint.get('terrain-analysis-attribute');
    }

    getOpacity(): number {
        return this.paint.get('terrain-analysis-opacity');
    }

    /**
     * Detect which expression global the color ramp uses, to determine the scalar type.
     * Returns the global name used in the interpolation expression (e.g. 'slope', 'elevation', 'aspect').
     */
    private _detectExpressionGlobal(): string {
        const attribute = this.getAttributeType();
        // Map attribute to the expression global name
        return attribute;
    }

    /**
     * Create the scalar color ramp, enforcing a maximum length for the vectors.
     */
    _createScalarRamp(maxLength: number, unpackVector?: number[]): ScalarRamp {
        const scalarRamp: ScalarRamp = {scalarStops: [], colorStops: []};
        const expression = this._transitionablePaint._values[this._colorProperty].value.expression;
        const globalName = this._detectExpressionGlobal();

        if (expression instanceof ZoomConstantExpression) {
            const inner = expression._styleExpression.expression;
            if (inner instanceof Interpolate) {
                this.colorRampExpression = expression;
                this.isStepMode = false;
                scalarRamp.scalarStops = inner.labels;
                scalarRamp.colorStops = [];
                for (const label of scalarRamp.scalarStops) {
                    scalarRamp.colorStops.push(inner.evaluate({globals: {[globalName]: label}} as unknown as EvaluationContext));
                }
            } else if (inner instanceof Step) {
                this.colorRampExpression = expression;
                this.isStepMode = true;
                // Step labels[0] is -Infinity (the default); replace with a sensible minimum
                const minValue = globalName === 'elevation' ? -500 : 0;
                scalarRamp.scalarStops = inner.labels.map((l, i) => i === 0 ? minValue : l);
                scalarRamp.colorStops = [];
                for (const label of scalarRamp.scalarStops) {
                    scalarRamp.colorStops.push(inner.evaluate({globals: {[globalName]: label}} as unknown as EvaluationContext));
                }
            }
        }
        if (scalarRamp.scalarStops.length < 1) {
            scalarRamp.scalarStops = [0];
            scalarRamp.colorStops = [Color.transparent];
        }
        if (scalarRamp.scalarStops.length < 2) {
            scalarRamp.scalarStops.push(scalarRamp.scalarStops[0] + 1);
            scalarRamp.colorStops.push(scalarRamp.colorStops[0]);
        }
        if (scalarRamp.scalarStops.length <= maxLength) {
            return scalarRamp;
        }

        const remappedRamp: ScalarRamp = {scalarStops: [], colorStops: []};
        const remapStepSize = (scalarRamp.scalarStops.length - 1) / (maxLength - 1);

        for (let i = 0; i < scalarRamp.scalarStops.length - 0.5; i += remapStepSize) {
            remappedRamp.scalarStops.push(scalarRamp.scalarStops[Math.round(i)]);
            remappedRamp.colorStops.push(scalarRamp.colorStops[Math.round(i)]);
        }
        warnOnce(`Too many colors in specification of ${this.id} terrain-analysis layer, may not render properly. Max possible colors: ${maxLength}, provided: ${scalarRamp.scalarStops.length}`);
        return remappedRamp;
    }

    _colorRampChanged(): boolean {
        return this.colorRampExpression != this._transitionablePaint._values[this._colorProperty].value.expression;
    }

    getScalarRampTextures(context: Context, maxLength: number, unpackVector: number[]): ScalarRampTextures {
        if (this.scalarRampTextures && !this._colorRampChanged()) {
            return this.scalarRampTextures;
        }
        const scalarRamp = this._createScalarRamp(maxLength, unpackVector);
        const colorImage = new RGBAImage({width: scalarRamp.colorStops.length, height: 1});
        const scalarImage = new RGBAImage({width: scalarRamp.colorStops.length, height: 1});
        const attribute = this.getAttributeType();

        for (let i = 0; i < scalarRamp.scalarStops.length; i++) {
            if (attribute === 'elevation') {
                // Pack elevation using DEM encoding for shader-side decoding
                const elevationPacked = packDEMData(scalarRamp.scalarStops[i], unpackVector);
                scalarImage.setPixel(0, i, new Color(elevationPacked.r / 255, elevationPacked.g / 255, elevationPacked.b / 255, 1));
            } else if (attribute === 'aspect') {
                // Pack aspect (0-360) into R,G channels for better precision
                const normalized = scalarRamp.scalarStops[i] / 360.0 * 256.0;
                const hi = Math.floor(normalized) / 256.0;
                const lo = (normalized - Math.floor(normalized));
                scalarImage.setPixel(0, i, new Color(hi, lo, 0, 1));
            } else {
                // Slope: store normalized to 0-1 range (slope / 90.0) in R channel
                const normalizedSlope = scalarRamp.scalarStops[i] / 90.0;
                scalarImage.setPixel(0, i, new Color(normalizedSlope, 0, 0, 1));
            }
            colorImage.setPixel(0, i, scalarRamp.colorStops[i]);
        }
        this.scalarRampTextures = {
            scalarTexture: new Texture(context, scalarImage, context.gl.RGBA),
            colorTexture: new Texture(context, colorImage, context.gl.RGBA)
        };
        return this.scalarRampTextures;
    }

    hasOffscreenPass() {
        return !this.isHidden() && !!this.scalarRampTextures;
    }
}

/**
 * Creates a TerrainAnalysisStyleLayer from a color-relief layer specification.
 * This provides backward compatibility: color-relief layers are internally
 * handled as terrain-analysis layers with attribute='elevation'.
 */
export function createTerrainAnalysisFromColorRelief(layer: LayerSpecification, globalState: Record<string, any>): TerrainAnalysisStyleLayer {
    // Translate color-relief paint properties to terrain-analysis equivalents
    const translatedLayer = {
        ...layer,
        type: 'terrain-analysis' as any,
        paint: {} as Record<string, any>
    };
    const srcPaint = (layer as any).paint || {};
    if (srcPaint['color-relief-opacity'] !== undefined) {
        translatedLayer.paint['terrain-analysis-opacity'] = srcPaint['color-relief-opacity'];
    }
    if (srcPaint['color-relief-color'] !== undefined) {
        translatedLayer.paint['terrain-analysis-color'] = srcPaint['color-relief-color'];
    }
    translatedLayer.paint['terrain-analysis-attribute'] = 'elevation';

    const styleLayer = new TerrainAnalysisStyleLayer(translatedLayer, globalState, 'elevation');
    // Preserve the original type for serialization
    styleLayer.type = 'color-relief' as any;
    return styleLayer;
}
