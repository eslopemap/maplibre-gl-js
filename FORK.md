# Fork Summary

This fork starts from `maplibre-gl-js` v5.21.0 and carries a focused terrain-analysis feature set on top of upstream, followed by blend-mode support, packaging/publishing work, and demo/documentation updates.

The active branch history ahead of `origin/main` is:

| Commit | Summary |
|---|---|
| `8a9c9c1` | Add a new `slope` layer type for DEM-based slope visualization |
| `9fb0053` | Add runtime style-spec patches for the slope layer type |
| `b216fab` | Replace the initial slope-specific layer with a unified `terrain-analysis` layer and preserve backward compatibility for `color-relief` |
| `86a654c` | Add step-expression support for discrete terrain-analysis color bands |
| `5b43f7a` | Remove temporary type workarounds |
| `0b5e7b7` | Fix underestimated slopes by applying mercator correction on both axes |
| `0e4547a` | Publish the fork as `@eslopemap/maplibre-gl` with a local style-spec tarball |
| `e40c163` | Add `blend-mode` support to raster layers |
| `6c61e40` | Add `blend-mode` support to `terrain-analysis` layers |
| `513374f` | Fix `terrain-analysis` compatibility with 3D terrain |
| `a2a902f` | Preserve destination alpha for `multiply` and `screen` |
| `35a606f` | Fix `multiply` becoming invisible when `terrain-analysis` is isolated in a separate 3D RTT stack |
| `759cfea` | Add render tests, fix premultiplied-alpha double-multiply, bump release |
| `45f9d7c` | Bump to `5.21.4`, fix published demo URL, add FBO multi-layer demo |
| `e8abcbf` | Add `PUBLISH.md` release checklist |

## What this fork adds

### 1. Terrain analysis as a first-class DEM layer

The first stage of the fork introduced DEM-based terrain visualization beyond upstream hillshade and color relief.

- Initial work started as a dedicated `slope` layer.
- The design then moved to a generalized `terrain-analysis` layer so the same rendering path could support:
  - `slope`
  - `aspect`
  - `elevation`
- `color-relief` compatibility was retained on top of this unified implementation.
- Step expressions were added so terrain outputs can be rendered as discrete color bands rather than only continuous ramps.
- Slope computation was corrected with mercator adjustment on both axes after early results were found to underestimate gradients.

This gives the fork a DEM analysis feature that is broader than upstream and more flexible than a one-off slope layer.

### 2. Blend modes for raster and terrain-analysis layers

The next major addition is a generic paint property, `blend-mode`, implemented for both `raster` and `terrain-analysis` layers.

First-pass supported values are:

- `normal`
- `multiply`
- `soft-multiply`
- `screen`

***Math Formulas used:***
- **multiply**: Mathematically standard sRGB multiply. $C_{out} = C_{dst} \times (1.0 - \alpha + C_{src} \times \alpha)$. Used via `glBlendFunc(DST_COLOR, ZERO)` paired with shader output `mix(1.0, src, opacity)`. It works like CSS `mix-blend-mode: multiply` but has a known visual issue of aggressively crushing midtones down to 50% luminance.
- **soft-multiply**: "Modulate 2X" composite. $C_{out} = C_{dst} \times (1.0 - \alpha + 2 \times \alpha \times C_{src})$. Used via `glBlendFunc(DST_COLOR, SRC_COLOR)` paired with shader output `mix(0.5, src, opacity)`. In this space, 0.5 (mid-gray) preserves the destination lightness exactly without darkening, shadowing only true blacks and brightening up to 2x for pure whites. It produces superior, un-muddied terrain slope and shaded-relief overlaps.

The implementation uses WebGL blend state plus shader-side control of premultiplied vs non-premultiplied output. We settled on one shared property name rather than a raster-only name, so the feature is reusable across layer types.

For `terrain-analysis`, this required:

- new uniform handling for premultiplied output selection
- neutral-color shader output for blend modes
- render-path dispatch based on whether the layer is drawn directly or through render-to-texture

### 3. Tests, demos, and publish surface

The later commits add the pieces needed to use and validate the fork as a distributable package:

- render tests for terrain-analysis behavior
- a regression test for the premultiplied alpha shader bug
- published package naming under `@eslopemap`
- a published demo page and an FBO-specific demo for 3D/blend debugging
- release documentation in `PUBLISH.md`

## Main issues encountered

### 1. Style-spec dependency and packaging drift

The largest non-rendering issue in this fork was the relationship between the root repo and the nested `maplibre-style-spec` repo.

The fork depends on local style-spec changes for the new terrain-analysis types and later for `blend-mode`. In practice, the root install repeatedly picked up stale style-spec artifacts instead of the freshly built ones.

The working short-term fix was to vendor the rebuilt style-spec artifacts directly into `node_modules`, then regenerate style code. That unblocked development, but it is not a durable package-management solution because any later `npm install` can overwrite the vendored copy.

Problems encountered included:

- root installs resolving the wrong style-spec contents
- symlink handling interfering with Rollup and TypeScript
- staging artifacts not being rewritten reliably
- the second Rollup pass merging stale chunks
- missing or incorrect `dist/maplibre-gl.js`
- oversized or effectively dev-like bundles failing `test-build`
- parser and typing failures when trying scripted Rollup/API-based builds

This was not one isolated error. It was an interaction problem between local dependency resolution, symlink behavior, and the two-stage Rollup build.

The notes indicate that focused validation like codegen, typecheck, and targeted tests could pass while the production bundle path was still broken. That distinction matters: feature work was largely valid, but packaging the fork cleanly took additional troubleshooting.

### 3. Multiply blend invisible in 3D terrain mode

The most important runtime rendering bug on the `blend` branch was a 3D terrain failure for `blend-mode: multiply`.

Root cause:

- In 3D terrain mode, MapLibre groups drapable layers into render-to-texture stacks.
- If a non-RTT-compatible layer sits between the terrain-analysis layer and surrounding drapable layers, the analysis layer can end up rendered into its own fresh FBO.
- That FBO starts as transparent black.
- `multiply` against transparent black yields transparent black, so the layer disappears entirely.

The fix was architectural rather than cosmetic:

- draw the `terrain-analysis` layer normally into the intermediate FBO
- carry stack-level blend intent through render-to-texture bookkeeping
- apply multiply later, at terrain drape time, using a dedicated `multiplyDrape` color mode that works with premultiplied FBO textures

This is the key rendering correction in the fork’s blend implementation.

### 4. Premultiplied alpha double-multiply

Another rendering bug appeared in the `terrain-analysis` shader path.

The shader was treating `rampColor` as if it still needed premultiplication even though it had already been multiplied by opacity. That effectively squared opacity in the RGB channels, making semi-transparent overlays much dimmer than intended.

The correction was simple once identified:

- stop multiplying `rampColor.rgb` by `rampColor.a` a second time
- output `rampColor` directly in the premultiplied path

This was later protected with a shader unit test.

### 5. Blend-state alpha handling

An earlier blend implementation also used the wrong alpha factors for `multiply` and `screen`.

That caused destination alpha to be blended away instead of preserved. A follow-up fix changed the blend equations to preserve destination alpha while still applying the desired RGB blend mode.

### 6. Architectural exploration beyond the shipped work

The fork also includes forward-looking design work recorded in `PLAN_UNIFIED.md` for a shared DEM prepare pass.

That plan is not the same as shipped code, but it documents an important architectural direction:

- hillshade already caches DEM derivatives per tile
- terrain-analysis still computes them every frame
- a shared `demPrepare` pass could let hillshade and terrain-analysis reuse the same prepared derivative texture

The notes also map out which future analysis types fit that model and which do not, especially for curvature and windowed statistics.

## Resulting state of the fork

At this point the fork represents more than a small feature patch. It is effectively a terrain-focused MapLibre variant with:

- a generalized `terrain-analysis` DEM layer
- corrected slope computation
- discrete band support
- `blend-mode` support for raster and terrain-analysis layers
- specific fixes for 3D RTT and premultiplied-alpha regressions
- publish-time work to ship the fork as `@eslopemap/maplibre-gl`
- demos and tests aimed at validating the new rendering behavior
