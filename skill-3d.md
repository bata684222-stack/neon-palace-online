# Skill: 3D (Three.js + PBR)

Based on Playtex/CraftPBR 2026 guides.

## Core
- Use `MeshStandardMaterial` for PBR. Always set `map` (sRGB) + `normalMap`/`roughnessMap`/`metalnessMap`/`aoMap` (Linear/NoColorSpace).
- `aoMap` needs second UV set. Normal maps stay `NoColorSpace`, never sRGB.
- Provide `TextureLoader` for each map, set `anisotropy=16`, `wrapS/T=RepeatWrapping`, `colorSpace` correctly.

```
const loader=new THREE.TextureLoader();
const albedo=loader.load('albedo.jpg'); albedo.colorSpace=THREE.SRGBColorSpace;
const normal=loader.load('normal.jpg');
const rough=loader.load('roughness.jpg');
const metal=loader.load('metallic.jpg');
const ao=loader.load('ao.jpg');
new THREE.MeshStandardMaterial({map:albedo, normalMap:normal, roughnessMap:rough, metalnessMap:metal, aoMap:ao})
```

## Lighting for PBR
- Need `DirectionalLight` + `PointLight` + `HemisphereLight` + `CubeTexture` envMap via `PMREMGenerator`. Without envMap metal looks plastic.
- ToneMapping `ACESFilmic`, exposure 1.1-1.15, `renderer.outputColorSpace=SRGB`.

## Texture Creation
- Seal next-gen: use Substance Painter / AI generators (Playtex PBR Map Generator) to get 7 maps from one image.
- Keep texel density consistent, mirror symmetry to save memory, use UDIM only for hero assets.

## Optimization
- Compress to KTX2, use atlas to reduce draw calls, lower res for distant/rough surfaces, use instancedMesh for repeats, limit shadow casters (2 max), `SRGB` only for albedo/emissive.

## Neon Palace specifics
- `carpetTexture 512` weave + gold damask + vignette, `floorTexture 512` marble veins, `wallTexture` panels — all `anisotropy 16`.
- EmissiveIntensity 2.5-2.8 for bloom, `bloom` div screen blend + `canvas filter brightness 1.07`.
