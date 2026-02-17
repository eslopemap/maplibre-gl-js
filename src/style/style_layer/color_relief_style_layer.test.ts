import {describe, test, expect, vi} from 'vitest';
import {TerrainAnalysisStyleLayer} from './terrain_analysis_style_layer';
import {Color, type LayerSpecification} from '@maplibre/maplibre-gl-style-spec';
import {createStyleLayer} from '../create_style_layer';
import {extend} from '../../util/util';
import {type EvaluationParameters} from '../evaluation_parameters';

function createColorReliefLayerSpec(properties?: {paint: {'color-relief-opacity'?: number; 'color-relief-color'?: Array<any>}}): LayerSpecification {
    return extend({
        type: 'color-relief',
        id: 'colorRelief',
        source: 'colorReliefSource'
    } as LayerSpecification, properties);
}

describe('ColorReliefStyleLayer (backward compat via TerrainAnalysisStyleLayer)', () => {

    test('default', () => {
        const layerSpec = createColorReliefLayerSpec();
        const layer = createStyleLayer(layerSpec, {});
        expect(layer).toBeInstanceOf(TerrainAnalysisStyleLayer);
        const taLayer = layer as TerrainAnalysisStyleLayer;
        expect(taLayer.type).toBe('color-relief');
        expect(taLayer.getAttributeType()).toBe('elevation');
        expect(taLayer.getOpacity()).toEqual(1);
        const ramp = taLayer._createScalarRamp(256);
        expect(ramp.scalarStops).toEqual([0, 1]);
        expect(ramp.colorStops).toEqual([Color.transparent, Color.transparent]);
    });

    test('parameters specified', () => {
        const layerSpec = createColorReliefLayerSpec({
            paint: {
                'color-relief-opacity': 0.5,
                'color-relief-color': [
                    'interpolate',
                    ['linear'],
                    ['elevation'],
                    0, '#000000',
                    1000, '#ffffff'
                ]
            }
        });
        const layer = createStyleLayer(layerSpec, {});
        expect(layer).toBeInstanceOf(TerrainAnalysisStyleLayer);
        const taLayer = layer as TerrainAnalysisStyleLayer;
        const ramp = taLayer._createScalarRamp(256);
        expect(ramp.scalarStops).toEqual([0, 1000]);
        expect(ramp.colorStops).toEqual([Color.black, Color.white]);

        taLayer.recalculate({zoom: 0, zoomHistory: {}} as EvaluationParameters, undefined);
        expect(taLayer.getOpacity()).toEqual(0.5);
    });

    test('single color', () => {
        const layerSpec = createColorReliefLayerSpec({
            paint: {
                'color-relief-color': [
                    'interpolate',
                    ['linear'],
                    ['elevation'],
                    0, '#ff0000'
                ]
            }
        });
        const layer = createStyleLayer(layerSpec, {});
        expect(layer).toBeInstanceOf(TerrainAnalysisStyleLayer);
        const taLayer = layer as TerrainAnalysisStyleLayer;
        const ramp = taLayer._createScalarRamp(256);
        expect(ramp.scalarStops).toEqual([0, 1]);
        expect(ramp.colorStops).toEqual([Color.red, Color.red]);
    });

    test('getScalarRamp: no remapping', () => {
        const layerSpec = createColorReliefLayerSpec({
            paint: {
                'color-relief-color': [
                    'interpolate',
                    ['linear'],
                    ['elevation'],
                    0, '#000000',
                    1000, '#ff0000',
                    2000, '#ff0000',
                    3000, '#ffffff'
                ]
            }
        });
        const layer = createStyleLayer(layerSpec, {});
        expect(layer).toBeInstanceOf(TerrainAnalysisStyleLayer);
        const taLayer = layer as TerrainAnalysisStyleLayer;

        const ramp = taLayer._createScalarRamp(4);

        expect(ramp.scalarStops).toEqual([0, 1000, 2000, 3000]);
        expect(ramp.colorStops).toEqual([Color.black, Color.red, Color.red, Color.white]);
    });

    test('getScalarRamp: with remapping', () => {
        const layerSpec = createColorReliefLayerSpec({
            paint: {
                'color-relief-color': [
                    'interpolate',
                    ['linear'],
                    ['elevation'],
                    0, '#000000',
                    1000, '#ff0000',
                    2000, '#ffffff',
                    3000, '#000000',
                    4000, '#ff0000'
                ]
            }
        });
        const layer = createStyleLayer(layerSpec, {});
        expect(layer).toBeInstanceOf(TerrainAnalysisStyleLayer);
        const taLayer = layer as TerrainAnalysisStyleLayer;
        const originalWarn = console.warn;
        console.warn = vi.fn();

        const ramp = taLayer._createScalarRamp(4);

        expect(ramp.scalarStops).toEqual([0, 1000, 3000, 4000]);
        expect(ramp.colorStops).toEqual([Color.black, Color.red, Color.black, Color.red]);
        expect(console.warn).toHaveBeenCalled();
        console.warn = originalWarn;
    });
});
