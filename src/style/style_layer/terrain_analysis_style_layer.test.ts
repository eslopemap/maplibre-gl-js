import {describe, test, expect} from 'vitest';
import {TerrainAnalysisStyleLayer} from './terrain_analysis_style_layer';
import {Color, type LayerSpecification} from '@maplibre/maplibre-gl-style-spec';
import {createStyleLayer} from '../create_style_layer';
import {extend} from '../../util/util';
import {type EvaluationParameters} from '../evaluation_parameters';

function createTerrainAnalysisLayerSpec(properties?: {paint: Record<string, any>}): LayerSpecification {
    return extend({
        type: 'terrain-analysis',
        id: 'terrainAnalysis',
        source: 'demSource'
    } as LayerSpecification, properties);
}

describe('TerrainAnalysisStyleLayer', () => {

    describe('interpolate expression (smooth gradient)', () => {
        test('sets isStepMode to false', () => {
            const layerSpec = createTerrainAnalysisLayerSpec({
                paint: {
                    'attribute': 'slope',
                    'color': [
                        'interpolate',
                        ['linear'],
                        ['slope'],
                        0, 'green',
                        30, 'yellow',
                        45, 'red'
                    ]
                }
            });
            const layer = createStyleLayer(layerSpec, {}) as TerrainAnalysisStyleLayer;
            const ramp = layer._createScalarRamp(256);
            expect(layer.isStepMode).toBe(false);
            expect(ramp.scalarStops).toEqual([0, 30, 45]);
            expect(ramp.colorStops.length).toBe(3);
        });
    });

    describe('step expression (discrete bands)', () => {
        test('sets isStepMode to true with correct stops', () => {
            const layerSpec = createTerrainAnalysisLayerSpec({
                paint: {
                    'attribute': 'slope',
                    'color': [
                        'step',
                        ['slope'],
                        'green',
                        15, 'yellow',
                        30, 'orange',
                        45, 'red'
                    ]
                }
            });
            const layer = createStyleLayer(layerSpec, {}) as TerrainAnalysisStyleLayer;
            const ramp = layer._createScalarRamp(256);
            expect(layer.isStepMode).toBe(true);
            // First label (-Infinity) replaced with 0 for slope
            expect(ramp.scalarStops).toEqual([0, 15, 30, 45]);
            expect(ramp.colorStops.length).toBe(4);
        });

        test('step colors are discrete (no blending)', () => {
            const layerSpec = createTerrainAnalysisLayerSpec({
                paint: {
                    'attribute': 'slope',
                    'color': [
                        'step',
                        ['slope'],
                        '#000000',
                        45, '#ffffff'
                    ]
                }
            });
            const layer = createStyleLayer(layerSpec, {}) as TerrainAnalysisStyleLayer;
            const ramp = layer._createScalarRamp(256);
            expect(layer.isStepMode).toBe(true);
            expect(ramp.scalarStops).toEqual([0, 45]);
            // Step evaluates to black for values < 45, white for >= 45
            expect(ramp.colorStops[0]).toEqual(Color.black);
            expect(ramp.colorStops[1]).toEqual(Color.white);
        });

        test('step with elevation uses -500 as minimum', () => {
            const layerSpec = createTerrainAnalysisLayerSpec({
                paint: {
                    'attribute': 'elevation',
                    'color': [
                        'step',
                        ['elevation'],
                        '#000000',
                        1000, '#ff0000',
                        3000, '#ffffff'
                    ]
                }
            });
            const layer = createStyleLayer(layerSpec, {}) as TerrainAnalysisStyleLayer;
            layer.recalculate({zoom: 0, zoomHistory: {}} as EvaluationParameters, undefined);
            const ramp = layer._createScalarRamp(256);
            expect(layer.isStepMode).toBe(true);
            // First label (-Infinity) replaced with -500 for elevation
            expect(ramp.scalarStops).toEqual([-500, 1000, 3000]);
            expect(ramp.colorStops.length).toBe(3);
        });

        test('step with aspect uses 0 as minimum', () => {
            const layerSpec = createTerrainAnalysisLayerSpec({
                paint: {
                    'attribute': 'aspect',
                    'color': [
                        'step',
                        ['aspect'],
                        '#ff0000',
                        90, '#00ff00',
                        180, '#0000ff',
                        270, '#ffff00'
                    ]
                }
            });
            const layer = createStyleLayer(layerSpec, {}) as TerrainAnalysisStyleLayer;
            const ramp = layer._createScalarRamp(256);
            expect(layer.isStepMode).toBe(true);
            expect(ramp.scalarStops).toEqual([0, 90, 180, 270]);
            expect(ramp.colorStops.length).toBe(4);
        });
    });

    describe('default (no expression)', () => {
        test('falls back to transparent ramp', () => {
            const layerSpec = createTerrainAnalysisLayerSpec();
            const layer = createStyleLayer(layerSpec, {}) as TerrainAnalysisStyleLayer;
            const ramp = layer._createScalarRamp(256);
            expect(ramp.scalarStops).toEqual([0, 1]);
            expect(ramp.colorStops).toEqual([Color.transparent, Color.transparent]);
        });
    });

    describe('remapping with step', () => {
        test('step ramp is remapped when exceeding maxLength', () => {
            const stops: any[] = ['step', ['slope'], '#000000'];
            for (let i = 1; i <= 10; i++) {
                stops.push(i * 5, `rgb(${i * 25}, 0, 0)`);
            }
            const layerSpec = createTerrainAnalysisLayerSpec({
                paint: {
                    'attribute': 'slope',
                    'color': stops
                }
            });
            const layer = createStyleLayer(layerSpec, {}) as TerrainAnalysisStyleLayer;
            const originalWarn = console.warn;
            console.warn = () => {};
            const ramp = layer._createScalarRamp(4);
            console.warn = originalWarn;
            expect(layer.isStepMode).toBe(true);
            // 11 stops remapped to 4
            expect(ramp.scalarStops.length).toBe(4);
        });
    });

    describe('shader binary search last-stop regression', () => {
        // Mirror the GLSL binary search from terrain_analysis.fragment.glsl
        // to verify the last color stop is reachable (fix for missing last color).
        function shaderBinarySearchIndex(scalar: number, scalarStops: number[], stepMode: boolean): number {
            const N = scalarStops.length;
            let r = N - 1;
            let l = 0;
            while (r - l > 1) {
                const m = (r + l) >> 1;
                if (scalar < scalarStops[m]) {
                    r = m;
                } else {
                    l = m;
                }
            }
            // Post-search promotion: make the last stop reachable
            if (scalar >= scalarStops[r]) {
                l = r;
            }
            if (stepMode || l === r) {
                return l; // texel index sampled
            }
            // interpolate: l is the base, blends toward r
            return l;
        }

        test('step mode: scalar beyond last stop selects last color', () => {
            // Reproduces the slopedothtml ANALYSIS_COLOR.slope ramp (13 stops, last at 65°)
            const stops = [0, 20, 24, 28, 31, 34, 37, 40, 43, 47, 52, 57, 65];
            // Before fix: l maxed at 11 (index of 57). After fix: l = 12 (index of 65).
            expect(shaderBinarySearchIndex(70, stops, true)).toBe(12);
            expect(shaderBinarySearchIndex(65, stops, true)).toBe(12);
            expect(shaderBinarySearchIndex(90, stops, true)).toBe(12);
        });

        test('step mode: scalar within range selects correct band', () => {
            const stops = [0, 20, 24, 28, 31, 34, 37, 40, 43, 47, 52, 57, 65];
            expect(shaderBinarySearchIndex(0, stops, true)).toBe(0);
            expect(shaderBinarySearchIndex(10, stops, true)).toBe(0);
            expect(shaderBinarySearchIndex(20, stops, true)).toBe(1);
            expect(shaderBinarySearchIndex(35, stops, true)).toBe(5);
            expect(shaderBinarySearchIndex(57, stops, true)).toBe(11);
            expect(shaderBinarySearchIndex(64, stops, true)).toBe(11);
        });

        test('interpolate mode: scalar at/beyond last stop clamps to last index', () => {
            const stops = [0, 30, 45];
            expect(shaderBinarySearchIndex(45, stops, false)).toBe(2);
            expect(shaderBinarySearchIndex(50, stops, false)).toBe(2);
        });

        test('two-stop ramp: last stop is reachable', () => {
            const stops = [0, 45];
            expect(shaderBinarySearchIndex(45, stops, true)).toBe(1);
            expect(shaderBinarySearchIndex(90, stops, true)).toBe(1);
        });
    });

    describe('blend-mode paint property', () => {
        test('defaults to normal when not specified', () => {
            const layer = createStyleLayer(createTerrainAnalysisLayerSpec(), {});
            expect(layer.getPaintProperty('blend-mode')).toEqual(undefined);
        });

        test('accepts multiply and screen', () => {
            const multiplyLayer = createStyleLayer(createTerrainAnalysisLayerSpec({
                paint: {'blend-mode': 'multiply'}
            }), {});
            const screenLayer = createStyleLayer(createTerrainAnalysisLayerSpec({
                paint: {'blend-mode': 'screen'}
            }), {});

            expect(multiplyLayer.getPaintProperty('blend-mode')).toEqual('multiply');
            expect(screenLayer.getPaintProperty('blend-mode')).toEqual('screen');
        });

        test('can be set alongside other terrain-analysis paint properties', () => {
            const layer = createStyleLayer(createTerrainAnalysisLayerSpec({
                paint: {
                    'attribute': 'slope',
                    'opacity': 0.8,
                    'blend-mode': 'multiply',
                    'color': [
                        'interpolate', ['linear'], ['slope'],
                        0, 'green', 45, 'red'
                    ]
                }
            }), {}) as TerrainAnalysisStyleLayer;

            expect(layer.getPaintProperty('blend-mode')).toEqual('multiply');
            layer.recalculate({zoom: 0, zoomHistory: {}} as EvaluationParameters, undefined);
            expect(layer.paint.get('blend-mode')).toEqual('multiply');
            expect(layer.paint.get('opacity')).toEqual(0.8);
        });
    });
});
