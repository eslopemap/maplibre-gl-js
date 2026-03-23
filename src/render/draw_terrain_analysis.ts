import {Texture} from './texture';
import type {StencilMode} from '../gl/stencil_mode';
import {DepthMode} from '../gl/depth_mode';
import {CullFaceMode} from '../gl/cull_face_mode';
import {ColorMode} from '../gl/color_mode';
import {
    terrainAnalysisUniformValues
} from './program/terrain_analysis_program';

import type {Painter, RenderOptions} from './painter';
import type {TileManager} from '../tile/tile_manager';
import type {TerrainAnalysisStyleLayer} from '../style/style_layer/terrain_analysis_style_layer';
import type {OverscaledTileID} from '../tile/tile_id';

export function drawTerrainAnalysis(painter: Painter, tileManager: TileManager, layer: TerrainAnalysisStyleLayer, tileIDs: Array<OverscaledTileID>, renderOptions: RenderOptions) {
    if (painter.renderPass !== 'translucent') return;
    if (!tileIDs.length) return;

    const {isRenderingToTexture} = renderOptions;
    const projection = painter.style.projection;
    const useSubdivision = projection.useSubdivision;

    const depthMode = painter.getDepthModeForSublayer(0, DepthMode.ReadOnly);
    const blendModeState = getBlendModeState(painter, layer);

    if (useSubdivision) {
        const [stencilBorderless, stencilBorders, coords] = painter.stencilConfigForOverlapTwoPass(tileIDs);
        renderTerrainAnalysis(painter, tileManager, layer, coords, stencilBorderless, depthMode, blendModeState, false, isRenderingToTexture);
        renderTerrainAnalysis(painter, tileManager, layer, coords, stencilBorders, depthMode, blendModeState, true, isRenderingToTexture);
    } else {
        const [stencil, coords] = painter.getStencilConfigForOverlapAndUpdateStencilID(tileIDs);
        renderTerrainAnalysis(painter, tileManager, layer, coords, stencil, depthMode, blendModeState, false, isRenderingToTexture);
    }
}

function renderTerrainAnalysis(
    painter: Painter,
    tileManager: TileManager,
    layer: TerrainAnalysisStyleLayer,
    coords: Array<OverscaledTileID>,
    stencilModes: {[_: number]: Readonly<StencilMode>},
    depthMode: Readonly<DepthMode>,
    blendModeState: BlendModeState,
    useBorder: boolean,
    isRenderingToTexture: boolean
) {
    const projection = painter.style.projection;
    const context = painter.context;
    const transform = painter.transform;
    const gl = context.gl;
    const program = painter.useProgram('terrainAnalysis');
    const align = !painter.options.moving;

    let firstTile = true;
    let colorRampSize = 0;

    for (const coord of coords) {
        const tile = tileManager.getTile(coord);
        const dem = tile.dem;

        if (!dem || !dem.data) {
            continue;
        }

        if (firstTile) {
            const maxLength = gl.getParameter(gl.MAX_TEXTURE_SIZE);
            const {scalarTexture, colorTexture} = layer.getScalarRampTextures(context, maxLength, dem.getUnpackVector());
            context.activeTexture.set(gl.TEXTURE1);
            scalarTexture.bind(gl.NEAREST, gl.CLAMP_TO_EDGE);
            context.activeTexture.set(gl.TEXTURE4);
            colorTexture.bind(gl.LINEAR, gl.CLAMP_TO_EDGE);
            firstTile = false;
            colorRampSize = scalarTexture.size[0];
        }

        const textureStride = dem.stride;

        const pixelData = dem.getPixels();
        context.activeTexture.set(gl.TEXTURE0);

        context.pixelStoreUnpackPremultiplyAlpha.set(false);
        tile.demTexture = tile.demTexture || painter.getTileTexture(textureStride);
        if (tile.demTexture) {
            const demTexture = tile.demTexture;
            demTexture.update(pixelData, {premultiply: false});
            demTexture.bind(gl.LINEAR, gl.CLAMP_TO_EDGE);
        } else {
            tile.demTexture = new Texture(context, pixelData, gl.RGBA, {premultiply: false});
            tile.demTexture.bind(gl.LINEAR, gl.CLAMP_TO_EDGE);
        }

        const mesh = projection.getMeshFromTileID(context, coord.canonical, useBorder, true, 'raster');

        const terrainData = painter.style.map.terrain?.getTerrainData(coord);

        const projectionData = transform.getProjectionData({
            overscaledTileID: coord,
            aligned: align,
            applyGlobeMatrix: !isRenderingToTexture,
            applyTerrainMatrix: true
        });

        program.draw(context, gl.TRIANGLES, depthMode, stencilModes[coord.overscaledZ], blendModeState.colorMode, CullFaceMode.backCCW,
            terrainAnalysisUniformValues(layer, tile.dem, colorRampSize, blendModeState.isPremultiplied, blendModeState.blendNeutral, coord, coord.overscaledZ), terrainData, projectionData, layer.id, mesh.vertexBuffer, mesh.indexBuffer, mesh.segments);
    }
}

type BlendModeState = {
    colorMode: Readonly<ColorMode>;
    isPremultiplied: number;
    blendNeutral: number;
};

function getBlendModeState(painter: Painter, layer: TerrainAnalysisStyleLayer): BlendModeState {
    const blendMode = layer.paint.get('blend-mode');

    if (blendMode === 'multiply') {
        return {
            colorMode: ColorMode.multiply,
            isPremultiplied: 0,
            blendNeutral: 1
        };
    }

    if (blendMode === 'screen') {
        return {
            colorMode: ColorMode.screen,
            isPremultiplied: 0,
            blendNeutral: 0
        };
    }

    return {
        colorMode: painter.colorModeForRenderPass(),
        isPremultiplied: 1,
        blendNeutral: 0
    };
}
