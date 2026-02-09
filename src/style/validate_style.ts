import {validateStyleMin} from '@maplibre/maplibre-gl-style-spec';
import {ErrorEvent} from '../util/evented';

import type {Evented} from '../util/evented';

// Import slope spec patch to ensure validation accepts slope layer type
import './slope_spec_patch';

type ValidationError = {
    message: string;
    line: number;
    identifier?: string;
};

export type Validator = (a: any) => ReadonlyArray<ValidationError>;

type ValidateStyle = {
    source: Validator;
    sprite: Validator;
    glyphs: Validator;
    layer: Validator;
    light: Validator;
    sky: Validator;
    terrain: Validator;
    filter: Validator;
    paintProperty: Validator;
    layoutProperty: Validator;
    (b: any, a?: any | null): ReadonlyArray<ValidationError>;
};

// Filter out validation errors that incorrectly reject slope layers using raster-dem sources.
// The published style-spec doesn't know about the slope layer type, so it rejects it.
function filterSlopeErrors(errors: ReadonlyArray<ValidationError>): ReadonlyArray<ValidationError> {
    return errors.filter(e =>
        !e.message.includes("raster-dem source can only be used with layer type 'hillshade' or 'color-relief'")
    );
}

function wrapValidator(fn: Validator): Validator {
    return (a: any) => filterSlopeErrors(fn(a));
}

const _validateStyle = validateStyleMin as unknown as ValidateStyle;

export const validateStyle: ValidateStyle = Object.assign(
    ((b: any, a?: any | null) => filterSlopeErrors(_validateStyle(b, a))) as ValidateStyle,
    {
        source: _validateStyle.source,
        sprite: _validateStyle.sprite,
        glyphs: _validateStyle.glyphs,
        layer: wrapValidator(_validateStyle.layer),
        light: _validateStyle.light,
        sky: _validateStyle.sky,
        terrain: _validateStyle.terrain,
        filter: _validateStyle.filter,
        paintProperty: _validateStyle.paintProperty,
        layoutProperty: _validateStyle.layoutProperty,
    }
);

export const validateSource = validateStyle.source;
export const validateLight = validateStyle.light;
export const validateSky = validateStyle.sky;
export const validateTerrain = validateStyle.terrain;
export const validateFilter = validateStyle.filter;
export const validatePaintProperty = validateStyle.paintProperty;
export const validateLayoutProperty = validateStyle.layoutProperty;

export function emitValidationErrors(
    emitter: Evented,
    errors?: ReadonlyArray<{
        message: string;
        identifier?: string;
    }> | null
): boolean {
    let hasErrors = false;
    if (errors && errors.length) {
        for (const error of errors) {
            emitter.fire(new ErrorEvent(new Error(error.message)));
            hasErrors = true;
        }
    }
    return hasErrors;
}
