import {
    Uniform1i,
    Uniform1f,
    Uniform2f,
    Uniform4f
} from '../uniform_binding';

import type {Context} from '../../gl/context';
import type {UniformValues, UniformLocations} from '../uniform_binding';
import type {TerrainAnalysisStyleLayer} from '../../style/style_layer/terrain_analysis_style_layer';
import type {DEMData} from '../../data/dem_data';
import type {OverscaledTileID} from '../../tile/tile_id';
import {MercatorCoordinate} from '../../geo/mercator_coordinate';

export type TerrainAnalysisUniformsType = {
    'u_image': Uniform1i;
    'u_unpack': Uniform4f;
    'u_dimension': Uniform2f;
    'u_zoom': Uniform1f;
    'u_scalar_stops': Uniform1i;
    'u_color_stops': Uniform1i;
    'u_color_ramp_size': Uniform1i;
    'u_opacity': Uniform1f;
    'u_latrange': Uniform2f;
    'u_attribute': Uniform1i;
};

const terrainAnalysisUniforms = (context: Context, locations: UniformLocations): TerrainAnalysisUniformsType => ({
    'u_image': new Uniform1i(context, locations.u_image),
    'u_unpack': new Uniform4f(context, locations.u_unpack),
    'u_dimension': new Uniform2f(context, locations.u_dimension),
    'u_zoom': new Uniform1f(context, locations.u_zoom),
    'u_scalar_stops': new Uniform1i(context, locations.u_scalar_stops),
    'u_color_stops': new Uniform1i(context, locations.u_color_stops),
    'u_color_ramp_size': new Uniform1i(context, locations.u_color_ramp_size),
    'u_opacity': new Uniform1f(context, locations.u_opacity),
    'u_latrange': new Uniform2f(context, locations.u_latrange),
    'u_attribute': new Uniform1i(context, locations.u_attribute)
});

function getTileLatRange(tileID: OverscaledTileID): [number, number] {
    const tilesAtZoom = Math.pow(2, tileID.canonical.z);
    const y = tileID.canonical.y;
    return [
        new MercatorCoordinate(0, y / tilesAtZoom).toLngLat().lat,
        new MercatorCoordinate(0, (y + 1) / tilesAtZoom).toLngLat().lat
    ];
}

function attributeToInt(attribute: 'elevation' | 'slope' | 'aspect'): number {
    switch (attribute) {
        case 'elevation': return 0;
        case 'slope': return 1;
        case 'aspect': return 2;
        default: return 1;
    }
}

const terrainAnalysisUniformValues = (
    layer: TerrainAnalysisStyleLayer,
    dem: DEMData,
    colorRampSize: number,
    tileID: OverscaledTileID,
    zoom: number
): UniformValues<TerrainAnalysisUniformsType> => {
    return {
        'u_image': 0,
        'u_unpack': dem.getUnpackVector(),
        'u_dimension': [dem.stride, dem.stride],
        'u_zoom': zoom,
        'u_scalar_stops': 1,
        'u_color_stops': 4,
        'u_color_ramp_size': colorRampSize,
        'u_opacity': layer.getOpacity(),
        'u_latrange': getTileLatRange(tileID),
        'u_attribute': attributeToInt(layer.getAttributeType())
    };
};

export {
    terrainAnalysisUniforms,
    terrainAnalysisUniformValues,
};
