// Patch the style spec to include the slope layer type
// This must be imported before any slope layer properties are accessed
import {v8 as styleSpec} from '@maplibre/maplibre-gl-style-spec';

if (!styleSpec.layer.type.values.slope) {
    (styleSpec.layer.type.values as any).slope = {
        doc: 'Client-side slope visualization based on DEM data.',
        'sdk-support': {
            'basic functionality': {
                js: '5.17.0'
            }
        }
    };
    (styleSpec as any).layout_slope = {
        visibility: styleSpec.layout_hillshade.visibility
    };
    (styleSpec as any).paint_slope = {
        'slope-opacity': {
            type: 'number',
            default: 1,
            minimum: 0,
            maximum: 1,
            doc: 'The opacity at which the slope layer will be drawn.',
            transition: true,
            expression: {interpolated: true, parameters: ['zoom']},
            'property-type': 'data-constant'
        },
        'slope-color': {
            type: 'color',
            doc: 'Defines the color of each pixel based on its slope angle in degrees (0-90).',
            transition: false,
            expression: {interpolated: true, parameters: ['slope']},
            'property-type': 'color-ramp'
        }
    };
}

export {};
