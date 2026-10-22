import * as THREE from 'three';
import {
  AsteroidMorphologySpec,
  ImpactSimulationResult,
} from '../types';

export interface ChildFragmentMeta {
  mesh: THREE.Mesh;
  wakeMesh: THREE.Mesh;
  radialDir: THREE.Vector3;
  lagSpeed: number;
  rotAxis: THREE.Vector3;
  baseScale: number;
}

export interface BuiltAsteroidRig {
  rootGroup: THREE.Group;
  coreGroup: THREE.Group;
  primaryMesh: THREE.Mesh;
  primaryMat: THREE.MeshStandardMaterial;
  bouldersInstanced: THREE.InstancedMesh;
  moonletPivot?: THREE.Group;
  moonletMesh?: THREE.Mesh;
  cryoJetsGroup?: THREE.Group;
  childFragmentsGroup: THREE.Group;
  childFragments: ChildFragmentMeta[];
  bowShockMesh: THREE.Mesh;
  bowShockMat: THREE.ShaderMaterial;
  plasmaWakeInner: THREE.Mesh;
  plasmaWakeInnerMat: THREE.ShaderMaterial;
  plasmaWakeOuter: THREE.Mesh;
  plasmaWakeOuterMat: THREE.ShaderMaterial;
  ablationParticles: THREE.Points;
  ablationPositions: Float32Array;
  ablationVelocities: Float32Array;
  ablationMat: THREE.PointsMaterial;
  entryCorridorGroup: THREE.Group;
  corridorStreaks: THREE.LineSegments;
  corridorCloudsGroup: THREE.Group;
  plasmaLight: THREE.PointLight;
  setThermalAblationState: (plasmaIntensity: number, timeSec: number) => void;
}

// ---------------------------------------------------------------------------
// Fast Deterministic 2D Value / Perlin-like FBM Noise for Photorealistic Craters
// ---------------------------------------------------------------------------
function hash2D(ix: number, iy: number): number {
  let n = ix * 374761393 + iy * 668265263;
  n = (n ^ (n >> 13)) * 1274126177;
  return ((n ^ (n >> 16)) >>> 0) / 4294967295;
}

function valueNoise2D(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);

  const a = hash2D(ix, iy);
  const b = hash2D(ix + 1, iy);
  const c = hash2D(ix, iy + 1);
  const d = hash2D(ix + 1, iy + 1);

  return a + (b - a) * ux + (c - a) * uy * (1 - ux) + (d - b) * ux * uy;
}

function fbm2D(x: number, y: number, octaves = 5): number {
  let val = 0;
  let amp = 0.5;
  let freq = 1.0;
  for (let i = 0; i < octaves; i++) {
    val += amp * valueNoise2D(x * freq, y * freq);
    freq *= 2.07;
    amp *= 0.5;
  }
  return val;
}

function ridgeNoise2D(x: number, y: number, octaves = 4): number {
  let val = 0;
  let amp = 0.5;
  let freq = 1.0;
  let weight = 1.0;
  for (let i = 0; i < octaves; i++) {
    let n = 1.0 - Math.abs(valueNoise2D(x * freq, y * freq) * 2.0 - 1.0);
    n = n * n * weight;
    weight = Math.max(0, Math.min(1, n * 1.8));
    val += n * amp;
    freq *= 2.15;
    amp *= 0.5;
  }
  return val;
}

interface PhotorealisticCraterTextureSuite {
  albedoTex: THREE.CanvasTexture;
  normalTex: THREE.CanvasTexture;
  roughnessTex: THREE.CanvasTexture;
  emissiveTex: THREE.CanvasTexture;
  alphaTex: THREE.CanvasTexture;
}

const cachedCraterSuites: Partial<Record<string, PhotorealisticCraterTextureSuite>> = {};

/**
 * Generates a high-resolution (512x512) Photorealistic Crater PBR Texture Suite:
 * 1. Albedo: Charred black ash (#12100e), pulverized dark-brown bedrock (#2b2119 - #4a3a2c),
 *    dark cooled basaltic crust in the center with deep crimson/orange magma cracks, and fading dusty ejecta rays.
 * 2. Normal Map: Tangent-space normal map derived from multi-octave FBM shattered rock + slump terraces + radial gullies.
 * 3. Roughness Map: Matte ash/breccia (0.92) vs vitrified impact melt glass in the pit (0.55).
 * 4. Emissive Map: Deep crimson/orange cooling lava fractures in the pit floor (ZERO white hole!).
 * 5. Alpha Map: Seamless radial feathering + natural ejecta ray streaks so the crater blends organically into the Earth.
 */
function getPhotorealisticCraterTextureSuite(
  regime: 'simple_crater' | 'complex_crater' | 'crust_melt_extinction'
): PhotorealisticCraterTextureSuite {
  if (cachedCraterSuites[regime]) {
    return cachedCraterSuites[regime]!;
  }

  const size = 512;
  const albedoCanvas = document.createElement('canvas');
  albedoCanvas.width = size;
  albedoCanvas.height = size;
  const aCtx = albedoCanvas.getContext('2d')!;
  const aImg = aCtx.createImageData(size, size);

  const normalCanvas = document.createElement('canvas');
  normalCanvas.width = size;
  normalCanvas.height = size;
  const nCtx = normalCanvas.getContext('2d')!;
  const nImg = nCtx.createImageData(size, size);

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = size;
  roughCanvas.height = size;
  const rCtx = roughCanvas.getContext('2d')!;
  const rImg = rCtx.createImageData(size, size);

  const emissiveCanvas = document.createElement('canvas');
  emissiveCanvas.width = size;
  emissiveCanvas.height = size;
  const eCtx = emissiveCanvas.getContext('2d')!;
  const eImg = eCtx.createImageData(size, size);

  const alphaCanvas = document.createElement('canvas');
  alphaCanvas.width = size;
  alphaCanvas.height = size;
  const alCtx = alphaCanvas.getContext('2d')!;
  const alImg = alCtx.createImageData(size, size);

  const heightField = new Float32Array(size * size);

  const isSimple = regime === 'simple_crater';
  const isExtinction = regime === 'crust_melt_extinction';

  // Normalized radius mapping:
  // r = 0.00 .. 0.22 -> Deep Central Melt Pit & Central Peak Massif
  // r = 0.22 .. 0.48 -> Inner Bowl Slump Walls & Terraces
  // r = 0.48 .. 0.56 -> Raised Shattered Rim Crest
  // r = 0.56 .. 1.00 -> Continuous Ejecta Blanket & Fading Radial Debris Rays
  const uRim = 0.52;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = y * size + x;
      const pIdx = idx * 4;

      const nx = (x / (size - 1)) * 2.0 - 1.0;
      const ny = (y / (size - 1)) * 2.0 - 1.0;
      const r = Math.hypot(nx, ny);
      const theta = Math.atan2(ny, nx);

      if (r >= 1.0) {
        heightField[idx] = 0;
        aImg.data[pIdx + 3] = 0;
        nImg.data[pIdx] = 128;
        nImg.data[pIdx + 1] = 128;
        nImg.data[pIdx + 2] = 255;
        nImg.data[pIdx + 3] = 255;
        alImg.data[pIdx] = 0;
        alImg.data[pIdx + 1] = 0;
        alImg.data[pIdx + 2] = 0;
        alImg.data[pIdx + 3] = 255;
        continue;
      }

      // Multi-scale Perlin/FBM rock noise & ridge fractures
      const rockLow = fbm2D(nx * 4.5 + 11.3, ny * 4.5 + 7.1, 4);
      const rockMid = fbm2D(nx * 14.0 + 3.7, ny * 14.0 + 19.2, 5);
      const rockHigh = fbm2D(nx * 36.0 + 5.1, ny * 36.0 + 8.4, 4);
      const ridge = ridgeNoise2D(nx * 10.5 + 2.1, ny * 10.5 - 4.3, 4);
      const fineCracks = ridgeNoise2D(nx * 22.0 - 9.2, ny * 22.0 + 6.8, 4);

      // Angular radial noise for natural ejecta rays and radial gullies
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);
      const rayNoise1 = fbm2D(cosT * 8.0 + r * 3.5, sinT * 8.0 + r * 3.5, 4);
      const rayNoise2 = fbm2D(cosT * 22.0 - r * 5.0, sinT * 22.0 - r * 5.0, 4);
      const rayStreak = Math.pow(Math.max(0, rayNoise1 * 0.65 + rayNoise2 * 0.35 - 0.18), 1.45);

      // Perturbed radial distance so the rim and terraces are organically jagged, never a perfect circle
      const rimPerturb = (rockLow - 0.5) * 0.045 + (rockMid - 0.5) * 0.022;
      const rw = Math.max(0, r + rimPerturb);

      // 1. Compute micro/meso height for tangent-space normal map
      let h = 0;
      if (rw < uRim) {
        const bowlNorm = rw / uRim;
        // Concave bowl slope + concentric terrace steps
        const terraceSteps = isSimple
          ? 0
          : Math.sin(bowlNorm * Math.PI * (isExtinction ? 9 : 6)) * 0.06 * Math.pow(bowlNorm, 1.4);
        const gullyChutes = (rayNoise2 - 0.5) * 0.08 * bowlNorm;
        h =
          -Math.cos(bowlNorm * Math.PI * 0.5) * 0.85 +
          terraceSteps +
          gullyChutes +
          rockMid * 0.18 +
          rockHigh * 0.09 +
          ridge * 0.12;

        // Central uplift massif crags for complex craters
        if (!isSimple && bowlNorm < 0.28) {
          const peakFactor = Math.cos((bowlNorm / 0.28) * Math.PI * 0.5);
          h += peakFactor * (0.45 + ridge * 0.38 + rockHigh * 0.15);
        }
      } else {
        const ejectaNorm = (rw - uRim) / (1.0 - uRim);
        const rimCrest = Math.exp(-Math.pow(ejectaNorm * 5.5, 2)) * 0.42;
        h =
          rimCrest +
          (1.0 - ejectaNorm) * (rockMid * 0.22 + ridge * 0.16 + rayStreak * 0.14) +
          rockHigh * 0.07;
      }
      heightField[idx] = h;

      // 2. Compute Photorealistic Albedo, Emissive Magma Cracks & Roughness
      let rCol = 32;
      let gCol = 26;
      let bCol = 22;
      let roughVal = 230;
      let emR = 0;
      let emG = 0;
      let emB = 0;

      // Deep central melt sheet & magma fissures (NO white hole!)
      const meltRadius = isExtinction ? 0.36 : isSimple ? 0.16 : 0.25;
      if (rw < meltRadius) {
        const meltFactor = 1.0 - rw / meltRadius;
        // Dark solidified basaltic crust (#110d0b to #1f1815)
        const crustShade = 14 + rockMid * 18 + rockHigh * 12;
        rCol = crustShade * 1.15;
        gCol = crustShade * 0.92;
        bCol = crustShade * 0.82;
        roughVal = Math.floor(135 + rockHigh * 60); // Glassy impact melt sheet

        // Branching incandescent magma cracks where fineCracks & ridge are sharp
        const crackMask = Math.max(
          0,
          (fineCracks - (isExtinction ? 0.46 : 0.56)) / (isExtinction ? 0.54 : 0.44)
        );
        const magmaHeat = Math.pow(crackMask, 1.65) * Math.pow(meltFactor, 0.45);

        if (magmaHeat > 0.02) {
          // Deep crimson (#7f1d1d) -> dark red-orange (#c2410c) -> molten amber (#f59e0b) in narrowest cores
          const coreGlow = Math.min(1, magmaHeat * 1.5);
          emR = Math.min(255, Math.floor(coreGlow * 245));
          emG = Math.min(255, Math.floor(Math.pow(coreGlow, 1.85) * 145));
          emB = Math.min(255, Math.floor(Math.pow(coreGlow, 3.2) * 38));

          rCol = Math.min(255, rCol + emR * 0.65);
          gCol = Math.min(255, gCol + emG * 0.45);
          bCol = Math.min(255, bCol + emB * 0.25);
        }
      } else if (rw < uRim) {
        // Inner Bowl Wall: Mix of charred black carbonized ash & dark-brown pulverized bedrock
        const wallPos = (rw - meltRadius) / Math.max(0.01, uRim - meltRadius);
        const terraceBand = Math.sin(wallPos * Math.PI * (isSimple ? 3 : 8)) * 0.5 + 0.5;
        const ashMix = Math.max(0, Math.min(1, rockLow * 0.7 + (1 - wallPos) * 0.45));

        // Pulverized dark brown bedrock (#3d2e24 -> #523e31) vs charred black ash (#151210)
        const bedrockR = 54 + rockMid * 34 + terraceBand * 14 + ridge * 16;
        const bedrockG = 41 + rockMid * 26 + terraceBand * 10 + ridge * 12;
        const bedrockB = 32 + rockMid * 20 + terraceBand * 7 + ridge * 9;

        const ashR = 19 + rockHigh * 14;
        const ashG = 16 + rockHigh * 12;
        const ashB = 14 + rockHigh * 11;

        rCol = bedrockR * (1 - ashMix * 0.65) + ashR * (ashMix * 0.65);
        gCol = bedrockG * (1 - ashMix * 0.65) + ashG * (ashMix * 0.65);
        bCol = bedrockB * (1 - ashMix * 0.65) + ashB * (ashMix * 0.65);
        roughVal = Math.floor(215 + rockHigh * 35);

        // Occasional subtle deep-seated radial thermal fracture on lower wall for complex/extinction craters
        if (!isSimple && wallPos < 0.45) {
          const wallCrack = Math.max(0, (fineCracks - 0.68) * 3.1) * (1 - wallPos / 0.45);
          if (wallCrack > 0.05) {
            emR = Math.min(255, Math.floor(wallCrack * 165));
            emG = Math.min(255, Math.floor(wallCrack * wallCrack * 62));
            emB = 8;
          }
        }
      } else {
        // Raised Rim Crest & Outer Ejecta Blanket / Radial Debris Rays
        const ejectaPos = (rw - uRim) / (1.0 - uRim);
        const rimHighlight = Math.exp(-Math.pow(ejectaPos * 4.5, 2));

        // Exposed shattered rim rock (#594638) transitioning to scorched ash & dusty brown-grey ejecta rays (#483b31)
        const baseR = 46 + rimHighlight * 32 + rockMid * 28 + rayStreak * 36;
        const baseG = 36 + rimHighlight * 25 + rockMid * 22 + rayStreak * 29;
        const baseB = 29 + rimHighlight * 19 + rockMid * 17 + rayStreak * 23;

        // Dark scorched blast collar just outside the rim (ejectaPos 0.05 .. 0.30)
        const scorchZone = Math.exp(-Math.pow((ejectaPos - 0.14) * 5.2, 2)) * (1 - rayStreak * 0.5);
        rCol = baseR * (1 - scorchZone * 0.52) + 16 * (scorchZone * 0.52);
        gCol = baseG * (1 - scorchZone * 0.52) + 14 * (scorchZone * 0.52);
        bCol = baseB * (1 - scorchZone * 0.52) + 12 * (scorchZone * 0.52);
        roughVal = 242;
      }

      // 3. Smooth Radial Edge Alpha Blending (100% opaque inside bowl & rim, feathers out via radial ejecta rays)
      let alpha = 1.0;
      if (rw > 0.55) {
        const fadeT = Math.min(1.0, (rw - 0.55) / 0.42);
        const baseFade = Math.pow(1.0 - fadeT, 1.85);
        // Radial ejecta rays extend further out than the continuous blanket, then softly fade to 0
        const rayExtension = rayStreak * Math.pow(1.0 - fadeT, 0.95) * 0.85;
        const noiseFeather = (rockLow * 0.6 + rockMid * 0.4) * (1.0 - fadeT);
        alpha = Math.max(0, Math.min(1, baseFade * 0.82 + rayExtension * 0.65 + noiseFeather * 0.25));
        // Guarantee zero hard edge at r -> 0.98
        alpha *= 1.0 - Math.pow(Math.max(0, (r - 0.82) / 0.16), 2.0);
      }

      aImg.data[pIdx] = Math.max(0, Math.min(255, Math.floor(rCol)));
      aImg.data[pIdx + 1] = Math.max(0, Math.min(255, Math.floor(gCol)));
      aImg.data[pIdx + 2] = Math.max(0, Math.min(255, Math.floor(bCol)));
      aImg.data[pIdx + 3] = 255;

      rImg.data[pIdx] = roughVal;
      rImg.data[pIdx + 1] = roughVal;
      rImg.data[pIdx + 2] = roughVal;
      rImg.data[pIdx + 3] = 255;

      eImg.data[pIdx] = emR;
      eImg.data[pIdx + 1] = emG;
      eImg.data[pIdx + 2] = emB;
      eImg.data[pIdx + 3] = 255;

      const alphaByte = Math.max(0, Math.min(255, Math.floor(alpha * 255)));
      alImg.data[pIdx] = alphaByte;
      alImg.data[pIdx + 1] = alphaByte;
      alImg.data[pIdx + 2] = alphaByte;
      alImg.data[pIdx + 3] = 255;
    }
  }

  // Compute Tangent-Space Normal Map from heightField finite differences
  const normalStrength = 5.5;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = y * size + x;
      const pIdx = idx * 4;
      const xm = Math.max(0, x - 1);
      const xp = Math.min(size - 1, x + 1);
      const ym = Math.max(0, y - 1);
      const yp = Math.min(size - 1, y + 1);

      const dX = (heightField[y * size + xp] - heightField[y * size + xm]) * normalStrength;
      const dY = (heightField[yp * size + x] - heightField[ym * size + x]) * normalStrength;

      let nx = -dX;
      let ny = dY;
      let nz = 1.0;
      const len = Math.hypot(nx, ny, nz) || 1.0;
      nx /= len;
      ny /= len;
      nz /= len;

      nImg.data[pIdx] = Math.floor((nx * 0.5 + 0.5) * 255);
      nImg.data[pIdx + 1] = Math.floor((ny * 0.5 + 0.5) * 255);
      nImg.data[pIdx + 2] = Math.floor((nz * 0.5 + 0.5) * 255);
      nImg.data[pIdx + 3] = 255;
    }
  }

  aCtx.putImageData(aImg, 0, 0);
  nCtx.putImageData(nImg, 0, 0);
  rCtx.putImageData(rImg, 0, 0);
  eCtx.putImageData(eImg, 0, 0);
  alCtx.putImageData(alImg, 0, 0);

  const albedoTex = new THREE.CanvasTexture(albedoCanvas);
  albedoTex.colorSpace = THREE.SRGBColorSpace;
  albedoTex.needsUpdate = true;

  const normalTex = new THREE.CanvasTexture(normalCanvas);
  normalTex.needsUpdate = true;

  const roughnessTex = new THREE.CanvasTexture(roughCanvas);
  roughnessTex.needsUpdate = true;

  const emissiveTex = new THREE.CanvasTexture(emissiveCanvas);
  emissiveTex.colorSpace = THREE.SRGBColorSpace;
  emissiveTex.needsUpdate = true;

  const alphaTex = new THREE.CanvasTexture(alphaCanvas);
  alphaTex.needsUpdate = true;

  const suite = { albedoTex, normalTex, roughnessTex, emissiveTex, alphaTex };
  cachedCraterSuites[regime] = suite;
  return suite;
}

/**
 * Generates a soft radial particle/dust sprite texture for scattered ejecta debris
 */
let cachedDustSpriteTex: THREE.CanvasTexture | null = null;
function getDustParticleTexture(): THREE.CanvasTexture {
  if (cachedDustSpriteTex) return cachedDustSpriteTex;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255, 248, 240, 1.0)');
  grad.addColorStop(0.35, 'rgba(214, 195, 178, 0.65)');
  grad.addColorStop(0.75, 'rgba(120, 102, 88, 0.22)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  cachedDustSpriteTex = new THREE.CanvasTexture(canvas);
  cachedDustSpriteTex.colorSpace = THREE.SRGBColorSpace;
  return cachedDustSpriteTex;
}

/**
 * Generates a scientifically accurate multi-part 3D Asteroid Group based on
 * radar shape models (Bennu spinning-top rubble pile, Apophis bilobed contact binary,
 * Didymos+Dimorphos binary system, M-type regmaglypt iron core, 67P bilobed cryo-comet,
 * or LL5 ordinary chondrite fragment) + realistic leading-edge stagnation ablation shader
 * and fiery plasma wake (matching Reference Images 2 & 3).
 */
export function buildScientificAsteroidRig(
  spec: AsteroidMorphologySpec,
  diameterM: number,
  astAlbedo: THREE.Texture,
  astBump: THREE.Texture,
  astEmissive: THREE.Texture
): BuiltAsteroidRig {
  const rootGroup = new THREE.Group();
  const coreGroup = new THREE.Group();
  rootGroup.add(coreGroup);

  const baseRadius = 5.6;
  const geo = new THREE.IcosahedronGeometry(baseRadius, 4);
  const posAttr = geo.attributes.position;
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();

  let seed =
    spec.archetype === 'bennu_rubble'
      ? 101955
      : spec.archetype === 'apophis_bilobed'
      ? 99942
      : spec.archetype === 'didymos_binary'
      ? 65803
      : spec.archetype === 'iron_monolith'
      ? 1616
      : spec.archetype === 'comet_nucleus'
      ? 6700
      : 2025;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  const craters: { dir: THREE.Vector3; radius: number; depth: number }[] = [];
  const craterCount = spec.archetype === 'iron_monolith' ? 22 : 14;
  for (let c = 0; c < craterCount; c++) {
    const theta = rand() * Math.PI * 2;
    const phi = Math.acos(2 * rand() - 1);
    craters.push({
      dir: new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta),
        Math.cos(phi),
        Math.sin(phi) * Math.sin(theta)
      ).normalize(),
      radius: spec.archetype === 'iron_monolith' ? 0.28 + rand() * 0.22 : 0.32 + rand() * 0.38,
      depth: spec.archetype === 'iron_monolith' ? 0.22 + rand() * 0.14 : 0.18 + rand() * 0.16,
    });
  }

  const [axX, axY, axZ] = spec.axialRatio;

  for (let i = 0; i < posAttr.count; i++) {
    v.fromBufferAttribute(posAttr, i);
    n.copy(v).normalize();

    if (spec.archetype === 'bennu_rubble' || spec.archetype === 'didymos_binary') {
      const eqDist = Math.abs(n.y);
      const equatorialRidge = Math.pow(Math.max(0, 1 - eqDist * 1.85), 1.7) * 0.36;
      const diamondTaper = 1.0 - eqDist * 0.18;
      const harmonic =
        Math.sin(n.x * 5.2 + n.z * 4.8) * 0.06 + Math.cos(n.y * 8.0 - n.x * 6.1) * 0.04;
      v.x *= axX * (diamondTaper + equatorialRidge);
      v.z *= axZ * (diamondTaper + equatorialRidge);
      v.y *= axY * (1.02 - eqDist * 0.08);
      v.multiplyScalar(1 + harmonic);
    } else if (spec.archetype === 'apophis_bilobed' || spec.archetype === 'comet_nucleus') {
      const waistCenter = -0.08;
      const distFromWaist = n.x - waistCenter;
      const neckPinch =
        1.0 -
        (spec.archetype === 'comet_nucleus' ? 0.52 : 0.44) *
          Math.exp(-Math.pow(distFromWaist * 3.1, 2));
      const headBulge = n.x > 0 ? 1.12 : 0.88;
      const lobeBendY = Math.pow(n.x, 2) * 0.95;
      const crag =
        Math.sin(n.x * 6.5 + n.y * 5.2) * 0.08 + Math.cos(n.z * 7.4 - n.y * 4.3) * 0.06;

      v.x *= axX;
      v.y = v.y * axY * neckPinch * headBulge + lobeBendY;
      v.z *= axZ * neckPinch * headBulge;
      v.multiplyScalar(1 + crag);
    } else if (spec.archetype === 'iron_monolith') {
      const cleavage =
        Math.sign(Math.sin(n.x * 3.6 + n.y * 2.8)) *
        Math.pow(Math.abs(Math.sin(n.x * 3.6 + n.y * 2.8)), 0.7) *
        0.14;
      v.x *= axX;
      v.y *= axY;
      v.z *= axZ;
      v.multiplyScalar(1 + cleavage);
    } else {
      const facet1 =
        Math.sign(Math.sin(n.x * 4.4 + n.y * 3.3)) *
        Math.pow(Math.abs(Math.sin(n.x * 4.4 + n.y * 3.3)), 0.65) *
        0.19;
      const facet2 = Math.cos(n.y * 6.8 - n.z * 6.2) * 0.12;
      v.x *= axX;
      v.y *= axY;
      v.z *= axZ;
      v.multiplyScalar(1 + facet1 + facet2);
    }

    let craterDelta = 0;
    for (const c of craters) {
      const d = n.distanceTo(c.dir);
      if (d < c.radius) {
        const u = d / c.radius;
        if (u < 0.78) {
          const bowl = Math.cos((u / 0.78) * Math.PI * 0.5);
          craterDelta -= bowl * c.depth;
        } else {
          const rimU = (u - 0.78) / 0.22;
          craterDelta += Math.sin(rimU * Math.PI) * c.depth * 0.35;
        }
      }
    }
    v.multiplyScalar(Math.max(0.55, 1 + craterDelta));
    posAttr.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();

  // Calibrated PBR Material with Stagnation Nose-to-Tail Thermal Ablation Shader Injection
  // Cold in vacuum (uPlasmaIntensity = 0); when entering atmosphere, the leading +Z hemisphere
  // glows incandescent white-yellow-orange with molten red-orange flame channels licking backward
  // while the rear -Z rock stays craggy grey-brown (matching Reference Image 3!).
  const ablationUniforms = {
    uPlasmaIntensity: { value: 0.0 },
    uTime: { value: 0.0 },
  };

  const primaryMat = new THREE.MeshStandardMaterial({
    color: spec.baseColorHex,
    map: astAlbedo,
    bumpMap: astBump,
    bumpScale: spec.archetype === 'iron_monolith' ? 1.35 : 2.1,
    emissiveMap: astEmissive,
    emissive: new THREE.Color(spec.plasmaPrimaryHex),
    emissiveIntensity: 0.0,
    roughness: spec.roughness,
    metalness: spec.metalness,
    flatShading: spec.archetype !== 'iron_monolith',
  });

  primaryMat.onBeforeCompile = (shader) => {
    shader.uniforms.uPlasmaIntensity = ablationUniforms.uPlasmaIntensity;
    shader.uniforms.uTime = ablationUniforms.uTime;

    shader.vertexShader =
      `
      varying vec3 vCoreSpacePos;
      ` +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
        #include <begin_vertex>
        vCoreSpacePos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        `
      );

    // Note: instead of world position, we can pass view/object directional heating using normal & local pos
    shader.vertexShader = shader.vertexShader.replace(
      'vCoreSpacePos = (modelMatrix * vec4(transformed, 1.0)).xyz;',
      'vCoreSpacePos = position;'
    );

    shader.fragmentShader =
      `
      uniform float uPlasmaIntensity;
      uniform float uTime;
      varying vec3 vCoreSpacePos;
      ` +
      shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `
        #include <emissivemap_fragment>
        if (uPlasmaIntensity > 0.01) {
          float streakNoise = sin(vCoreSpacePos.x * 2.8 + uTime * 8.0) * cos(vCoreSpacePos.y * 2.8 - uTime * 6.0) * 0.5 + 0.5;
          float grooveHeat = clamp((vCoreSpacePos.z + 3.2 + streakNoise * 2.8) / 8.2, 0.0, 1.0);
          float noseCore = pow(clamp((vCoreSpacePos.z + 1.0) / 5.5, 0.0, 1.0), 2.2);
          vec3 deepRed = vec3(0.85, 0.14, 0.02);
          vec3 moltenOrange = vec3(1.0, 0.48, 0.06);
          vec3 incandescentWhite = vec3(1.0, 0.96, 0.82);
          vec3 ablationCol = mix(deepRed, moltenOrange, grooveHeat);
          ablationCol = mix(ablationCol, incandescentWhite, noseCore);
          totalEmissiveRadiance += ablationCol * pow(grooveHeat, 1.45) * uPlasmaIntensity * 3.4;
        }
        `
      );
  };

  const primaryMesh = new THREE.Mesh(geo, primaryMat);
  coreGroup.add(primaryMesh);

  // Surface Boulders (InstancedMesh anchored flush on the deformed asteroid surface)
  const boulderGeo = new THREE.DodecahedronGeometry(0.42, 0);
  const boulderMat = new THREE.MeshStandardMaterial({
    color: spec.secondaryColorHex,
    map: astAlbedo,
    bumpMap: astBump,
    bumpScale: 1.1,
    roughness: Math.min(0.98, spec.roughness + 0.08),
    metalness: spec.metalness * 0.85,
    flatShading: true,
  });
  const bouldersInstanced = new THREE.InstancedMesh(
    boulderGeo,
    boulderMat,
    spec.boulderCount
  );
  const dummyMat = new THREE.Matrix4();
  const bPos = new THREE.Vector3();
  const bQuat = new THREE.Quaternion();
  const bScale = new THREE.Vector3();
  const bEuler = new THREE.Euler();
  const bColor = new THREE.Color();

  for (let i = 0; i < spec.boulderCount; i++) {
    const vIdx = Math.floor(rand() * posAttr.count);
    bPos.fromBufferAttribute(posAttr, vIdx).multiplyScalar(0.98);
    bEuler.set(rand() * Math.PI * 2, rand() * Math.PI * 2, rand() * Math.PI * 2);
    bQuat.setFromEuler(bEuler);
    const s = 0.45 + Math.pow(rand(), 1.8) * 1.45;
    bScale.set(s * (0.8 + rand() * 0.5), s * (0.6 + rand() * 0.4), s);
    dummyMat.compose(bPos, bQuat, bScale);
    bouldersInstanced.setMatrixAt(i, dummyMat);

    const shade = 0.78 + rand() * 0.42;
    bColor.setHex(spec.secondaryColorHex).multiplyScalar(shade);
    bouldersInstanced.setColorAt(i, bColor);
  }
  bouldersInstanced.instanceMatrix.needsUpdate = true;
  if (bouldersInstanced.instanceColor) bouldersInstanced.instanceColor.needsUpdate = true;
  coreGroup.add(bouldersInstanced);

  let moonletPivot: THREE.Group | undefined;
  let moonletMesh: THREE.Mesh | undefined;
  if (spec.hasMoonlet) {
    moonletPivot = new THREE.Group();
    const moonGeo = new THREE.IcosahedronGeometry(1.75, 2);
    moonGeo.scale(1.32, 0.86, 0.95);
    const moonMat = primaryMat.clone();
    moonMat.color.setHex(spec.secondaryColorHex);
    moonletMesh = new THREE.Mesh(moonGeo, moonMat);
    moonletMesh.position.set(14.5, 1.2, 0);
    moonletPivot.add(moonletMesh);
    rootGroup.add(moonletPivot);
  }

  let cryoJetsGroup: THREE.Group | undefined;
  if (spec.hasCryoJets) {
    cryoJetsGroup = new THREE.Group();
    const jetMat = new THREE.MeshBasicMaterial({
      color: 0xbae6fd,
      transparent: true,
      opacity: 0.28,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const jetDirs = [
      new THREE.Vector3(0.4, 0.85, 0.3).normalize(),
      new THREE.Vector3(-0.6, 0.65, -0.4).normalize(),
      new THREE.Vector3(0.1, -0.88, 0.45).normalize(),
    ];
    for (const dir of jetDirs) {
      const jetGeo = new THREE.ConeGeometry(1.35, 9.5, 14, 1, true);
      jetGeo.translate(0, 4.75, 0);
      const jetMesh = new THREE.Mesh(jetGeo, jetMat);
      jetMesh.position.copy(dir.clone().multiplyScalar(3.6));
      jetMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      cryoJetsGroup.add(jetMesh);
    }
    coreGroup.add(cryoJetsGroup);
  }

  // Dynamic 3D Atmospheric Fragmentation Swarm (12 Child Bolides + Individual Ionized Wakes)
  const childFragmentsGroup = new THREE.Group();
  childFragmentsGroup.visible = false;
  rootGroup.add(childFragmentsGroup);

  const childFragments: ChildFragmentMeta[] = [];
  const fragCount = 12;
  for (let i = 0; i < fragCount; i++) {
    const fRadius = 1.05 + rand() * 1.45;
    const fGeo = new THREE.IcosahedronGeometry(fRadius, 1);
    fGeo.scale(1.25, 0.78 + rand() * 0.35, 0.88 + rand() * 0.3);
    const fMat = new THREE.MeshStandardMaterial({
      color: spec.baseColorHex,
      map: astAlbedo,
      bumpMap: astBump,
      bumpScale: 1.4,
      emissive: new THREE.Color(0xff7b00),
      emissiveIntensity: 2.2,
      roughness: 0.75,
      metalness: spec.metalness,
      flatShading: true,
    });
    const fMesh = new THREE.Mesh(fGeo, fMat);

    const wGeo = new THREE.ConeGeometry(fRadius * 0.92, fRadius * 8.5, 12, 1, true);
    wGeo.translate(0, -fRadius * 4.25, 0);
    wGeo.rotateX(-Math.PI * 0.5);
    const wMat = new THREE.MeshBasicMaterial({
      color: 0xff9e2c,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const wMesh = new THREE.Mesh(wGeo, wMat);
    fMesh.add(wMesh);

    const angle = (i / fragCount) * Math.PI * 2 + (rand() - 0.5) * 0.35;
    const radialDir = new THREE.Vector3(
      Math.cos(angle) * (0.65 + rand() * 0.75),
      Math.sin(angle) * (0.65 + rand() * 0.75),
      -(0.4 + rand() * 1.4)
    );

    childFragmentsGroup.add(fMesh);
    childFragments.push({
      mesh: fMesh,
      wakeMesh: wMesh,
      radialDir,
      lagSpeed: 4.5 + rand() * 9.5,
      rotAxis: new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize(),
      baseScale: 0.55 + rand() * 0.65,
    });
  }

  // -------------------------------------------------------------------------
  // Hypersonic Stagnation Bow-Shock Cap (Incandescent White-Yellow-Orange Nose)
  // Matches Reference Images 2 & 3!
  // -------------------------------------------------------------------------
  const bowShockGeo = new THREE.SphereGeometry(
    baseRadius * 1.24,
    36,
    24,
    0,
    Math.PI * 2,
    0,
    Math.PI * 0.52
  );
  bowShockGeo.rotateX(Math.PI * 0.5);
  const bowShockMat = new THREE.ShaderMaterial({
    uniforms: {
      uOpacity: { value: 0.0 },
      uTime: { value: 0.0 },
      uPrimaryColor: { value: new THREE.Color(0xfff7d6) },
      uSecondaryColor: { value: new THREE.Color(0xff5500) },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        vViewDir = normalize(-mvPos.xyz);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: `
      uniform float uOpacity;
      uniform float uTime;
      uniform vec3 uPrimaryColor;
      uniform vec3 uSecondaryColor;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      void main() {
        // vUv.y goes from 1.0 at the +Z stagnation tip to 0.0 at the skirt edge
        float tipFactor = smoothstep(0.0, 0.92, vUv.y);
        float skirtFade = smoothstep(0.0, 0.35, vUv.y);
        float flicker = 0.88 + 0.12 * sin(vUv.x * 38.0 + uTime * 16.0) * cos(vUv.y * 18.0 - uTime * 12.0);
        vec3 col = mix(uSecondaryColor, uPrimaryColor, pow(tipFactor, 1.35));
        col = mix(col, vec3(1.0, 1.0, 0.96), pow(tipFactor, 3.0));
        float alpha = skirtFade * (0.45 + 0.55 * tipFactor) * flicker * uOpacity;
        gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.98));
      }
    `,
    transparent: true,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const bowShockMesh = new THREE.Mesh(bowShockGeo, bowShockMat);
  bowShockMesh.visible = false;
  rootGroup.add(bowShockMesh);

  // -------------------------------------------------------------------------
  // Striated Fiery Plasma Wake Sheath (Matches Reference Images 2 & 3!)
  // Extends from z = +2.5 (wrapping the asteroid shoulders) to z = -42 along -Z
  // -------------------------------------------------------------------------
  const createPlasmaWakeShader = (
    coreHex: number,
    tailHex: number,
    filamentFreq: number
  ): THREE.ShaderMaterial => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uOpacity: { value: 0.0 },
        uTime: { value: 0.0 },
        uCoreColor: { value: new THREE.Color(coreHex) },
        uTailColor: { value: new THREE.Color(tailHex) },
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vViewDir;
        void main() {
          vUv = uv;
          vNormal = normalize(normalMatrix * normal);
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          vViewDir = normalize(-mvPos.xyz);
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: `
        uniform float uOpacity;
        uniform float uTime;
        uniform vec3 uCoreColor;
        uniform vec3 uTailColor;
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vViewDir;
        void main() {
          // vUv.y = 1.0 at the asteroid nose (+Z), 0.0 at the far wake tail (-Z)
          float along = clamp(vUv.y, 0.0, 1.0);
          float headFade = smoothstep(1.0, 0.86, along);
          float tailFade = pow(along, 1.55);

          // Turbulent fiery ablation filaments streaming backward
          float angle = vUv.x * 6.2831853;
          float s1 = sin(angle * ${filamentFreq.toFixed(1)} + along * 14.0 - uTime * 22.0);
          float s2 = cos(angle * ${(filamentFreq * 1.7).toFixed(1)} - along * 21.0 + uTime * 17.0);
          float filaments = 0.55 + 0.45 * (s1 * 0.6 + s2 * 0.4);

          float edgeSoft = 0.35 + 0.65 * abs(dot(vNormal, vViewDir));
          vec3 whiteHot = vec3(1.0, 0.96, 0.82);
          vec3 col = mix(uTailColor, uCoreColor, pow(along, 0.85));
          col = mix(col, whiteHot, pow(along, 2.6) * 0.85);

          float alpha = headFade * tailFade * filaments * edgeSoft * uOpacity;
          gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.95));
        }
      `,
      transparent: true,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
  };

  const wakeInnerGeo = new THREE.CylinderGeometry(
    baseRadius * 1.16,
    baseRadius * 0.25,
    40,
    32,
    16,
    true
  );
  wakeInnerGeo.translate(0, -17.5, 0);
  wakeInnerGeo.rotateX(Math.PI * 0.5); // Spans z = +2.5 to z = -37.5
  const plasmaWakeInnerMat = createPlasmaWakeShader(0xffb703, 0xea580c, 9.0);
  const plasmaWakeInner = new THREE.Mesh(wakeInnerGeo, plasmaWakeInnerMat);
  plasmaWakeInner.visible = false;
  rootGroup.add(plasmaWakeInner);

  const wakeOuterGeo = new THREE.CylinderGeometry(
    baseRadius * 1.48,
    baseRadius * 0.65,
    62,
    32,
    16,
    true
  );
  wakeOuterGeo.translate(0, -28.0, 0);
  wakeOuterGeo.rotateX(Math.PI * 0.5); // Spans z = +3.0 to z = -59.0
  const plasmaWakeOuterMat = createPlasmaWakeShader(0xf97316, 0x991b1b, 14.0);
  const plasmaWakeOuter = new THREE.Mesh(wakeOuterGeo, plasmaWakeOuterMat);
  plasmaWakeOuter.visible = false;
  rootGroup.add(plasmaWakeOuter);

  // 3D Ablation Sparks & Glowing Debris Embers (Streaming along -Z like Reference Image 2!)
  const particleCount = 240;
  const ablationPositions = new Float32Array(particleCount * 3);
  const ablationVelocities = new Float32Array(particleCount * 3);
  for (let i = 0; i < particleCount; i++) {
    const zBack = -(Math.random() * 54);
    const spread = 2.2 + Math.abs(zBack) * 0.22;
    const a = Math.random() * Math.PI * 2;
    ablationPositions[i * 3] = Math.cos(a) * spread * (0.35 + Math.random() * 0.65);
    ablationPositions[i * 3 + 1] = Math.sin(a) * spread * (0.35 + Math.random() * 0.65);
    ablationPositions[i * 3 + 2] = zBack;

    ablationVelocities[i * 3] = (Math.random() - 0.5) * 6.5;
    ablationVelocities[i * 3 + 1] = (Math.random() - 0.5) * 6.5;
    ablationVelocities[i * 3 + 2] = -(34 + Math.random() * 52);
  }
  const ablationGeo = new THREE.BufferGeometry();
  ablationGeo.setAttribute('position', new THREE.BufferAttribute(ablationPositions, 3));
  const ablationMat = new THREE.PointsMaterial({
    color: 0xffd166,
    map: getDustParticleTexture(),
    size: 1.85,
    transparent: true,
    opacity: 0.0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const ablationParticles = new THREE.Points(ablationGeo, ablationMat);
  ablationParticles.visible = false;
  rootGroup.add(ablationParticles);

  // 3D Atmospheric Entry Corridor (Rushing atmospheric ionization streaks & sunlit cloud tops for the PiP Viewport)
  const entryCorridorGroup = new THREE.Group();
  entryCorridorGroup.visible = false;
  rootGroup.add(entryCorridorGroup);

  const streakCount = 72;
  const streakVerts = new Float32Array(streakCount * 6);
  for (let i = 0; i < streakCount; i++) {
    const r = 10 + Math.random() * 26;
    const theta = Math.random() * Math.PI * 2;
    const x = Math.cos(theta) * r;
    const y = Math.sin(theta) * r;
    const zStart = 38 - Math.random() * 90;
    const len = 10 + Math.random() * 18;
    streakVerts[i * 6] = x;
    streakVerts[i * 6 + 1] = y;
    streakVerts[i * 6 + 2] = zStart;
    streakVerts[i * 6 + 3] = x;
    streakVerts[i * 6 + 4] = y;
    streakVerts[i * 6 + 5] = zStart - len;
  }
  const streakGeo = new THREE.BufferGeometry();
  streakGeo.setAttribute('position', new THREE.BufferAttribute(streakVerts, 3));
  const streakMat = new THREE.LineBasicMaterial({
    color: 0xfdba74,
    transparent: true,
    opacity: 0.52,
    blending: THREE.AdditiveBlending,
  });
  const corridorStreaks = new THREE.LineSegments(streakGeo, streakMat);
  entryCorridorGroup.add(corridorStreaks);

  const corridorCloudsGroup = new THREE.Group();
  const cloudPuffMat = new THREE.MeshStandardMaterial({
    color: 0xe0f2fe,
    emissive: new THREE.Color(0x38bdf8),
    emissiveIntensity: 0.35,
    roughness: 0.85,
    transparent: true,
    opacity: 0.42,
    flatShading: true,
    depthWrite: false,
  });
  for (let i = 0; i < 14; i++) {
    const puffGeo = new THREE.DodecahedronGeometry(3.2 + (i % 4) * 1.4, 1);
    puffGeo.scale(2.4, 0.52, 1.5);
    const puff = new THREE.Mesh(puffGeo, cloudPuffMat);
    const angle = (i / 14) * Math.PI * 2;
    const dist = 16 + (i % 3) * 7;
    puff.position.set(
      Math.cos(angle) * dist,
      Math.sin(angle) * dist - 5,
      38 - i * 6.5
    );
    corridorCloudsGroup.add(puff);
  }
  entryCorridorGroup.add(corridorCloudsGroup);

  const plasmaLight = new THREE.PointLight(0xff8800, 0.0, 120);
  plasmaLight.position.set(0, 0, 7.5); // Illuminates the leading stagnation nose and clouds ahead!
  rootGroup.add(plasmaLight);

  const visualScale = getAsteroidVisualScale(diameterM);
  coreGroup.scale.setScalar(visualScale);
  // Scale bow-shock and plasma wake proportionally so a 5m meteoroid looks like a crisp pinpoint superbolide
  const wakeRadialScale = Math.max(0.28, visualScale);
  const wakeLengthScale = Math.max(0.45, Math.min(1.35, 0.38 + visualScale * 0.62));
  bowShockMesh.scale.setScalar(wakeRadialScale);
  plasmaWakeInner.scale.set(wakeRadialScale, wakeRadialScale, wakeLengthScale);
  plasmaWakeOuter.scale.set(wakeRadialScale, wakeRadialScale, wakeLengthScale);

  const setThermalAblationState = (plasmaIntensity: number, timeSec: number) => {
    ablationUniforms.uPlasmaIntensity.value = plasmaIntensity;
    ablationUniforms.uTime.value = timeSec;
    bowShockMat.uniforms.uOpacity.value = Math.min(0.95, plasmaIntensity * 0.95);
    bowShockMat.uniforms.uTime.value = timeSec;
    plasmaWakeInnerMat.uniforms.uOpacity.value = Math.min(0.92, plasmaIntensity * 0.9);
    plasmaWakeInnerMat.uniforms.uTime.value = timeSec;
    plasmaWakeOuterMat.uniforms.uOpacity.value = Math.min(0.72, plasmaIntensity * 0.7);
    plasmaWakeOuterMat.uniforms.uTime.value = timeSec;
  };

  return {
    rootGroup,
    coreGroup,
    primaryMesh,
    primaryMat,
    bouldersInstanced,
    moonletPivot,
    moonletMesh,
    cryoJetsGroup,
    childFragmentsGroup,
    childFragments,
    bowShockMesh,
    bowShockMat,
    plasmaWakeInner,
    plasmaWakeInnerMat,
    plasmaWakeOuter,
    plasmaWakeOuterMat,
    ablationParticles,
    ablationPositions,
    ablationVelocities,
    ablationMat,
    entryCorridorGroup,
    corridorStreaks,
    corridorCloudsGroup,
    plasmaLight,
    setThermalAblationState,
  };
}

/**
 * Scientifically calibrated visual scale for the 3D asteroid mesh across 4 orders of magnitude:
 * - 5m meteoroid -> 0.18 (compact pinpoint bolide, never oversized!)
 * - 20m Chelyabinsk -> 0.34
 * - 50m Tunguska/Barringer -> 0.52
 * - 160m Dimorphos -> 0.76
 * - 370m Apophis -> 0.98
 * - 1,000m -> 1.26
 * - 10,000m Chicxulub -> 1.85
 */
export function getAsteroidVisualScale(diameterM: number): number {
  const clamped = Math.max(2, Math.min(15000, diameterM || 100));
  const normLog = Math.log10(clamped / 5) / Math.log10(10000 / 5); // 0 at 5m, 1 at 10km
  return 0.18 + Math.pow(Math.max(0, normLog), 0.78) * 1.67;
}

/**
 * Builds the Photorealistic 3D Planetary Aftermath on Earth:
 * - 'airburst': Realistic GLSL Refractive Acoustic Sonic Boom & Wilson Condensation Wave (zero ground crater, fades cleanly to 0!)
 * - 'ocean_tsunami': Deep sapphire acoustic water cavity + towering 3D whitewater/steam splash crown + concentric tsunami wave rings
 * - 'simple_crater' / 'complex_crater' / 'crust_melt_extinction':
 *   True 3D Spherical-Conforming Elliptical Concave Crater Bowl Depression with:
 *   1. Charred black ash, pulverized dark-brown bedrock, and deep crimson/orange cooling magma fissures
 *   2. Oblique elliptical elongation (crater_ellipticity) and asymmetrical downrange ejecta blanket
 *   3. High-res Perlin/FBM normal-mapped shattered rock interior & raised rim that catches directional sunlight
 *   4. Smooth alpha-feathered ejecta blanket & radial dust/debris rays
 */
export function buildRegimeSpecific3DCrater(
  lat: number,
  lon: number,
  earthRadius: number,
  craterRadiusUnits: number,
  result: ImpactSimulationResult,
  _astAlbedo: THREE.Texture,
  _astBump: THREE.Texture,
  latLonToVec3: (lat: number, lon: number, r: number) => THREE.Vector3
): THREE.Group {
  const group = new THREE.Group();
  const regime = result.impact_regime;

  // 1. STRATOSPHERIC AIRBURST REGIME -> Strictly ZERO Ground Crater!
  // Uses a realistic GLSL N-Wave Sonic Boom & Atmospheric Condensation Wave Shader (no cartoon white ball!)
  if (regime === 'airburst') {
    const burstHeightUnits = Math.max(3.6, Math.min(8.5, (result.burst_altitude_km / 35) * 6.5));
    const burstPos = latLonToVec3(lat, lon, earthRadius + burstHeightUnits);

    const sonicCluster = new THREE.Group();
    sonicCluster.position.copy(burstPos);
    sonicCluster.lookAt(burstPos.clone().multiplyScalar(2));

    // Scale sonic wave extent by yield (small 5m bolide = compact local sonic boom; Tunguska = wide stratospheric wave)
    const yieldScale = Math.max(
      0.38,
      Math.min(1.65, 0.35 + Math.log10(Math.max(0.01, result.tnt_kilotons) + 1) * 0.28)
    );
    const maxWavePlaneRadius = Math.max(5.5, craterRadiusUnits * 2.2 * yieldScale);

    const sonicPlaneGeo = new THREE.PlaneGeometry(maxWavePlaneRadius * 2, maxWavePlaneRadius * 2, 32, 32);
    const sonicWaveMat = new THREE.ShaderMaterial({
      uniforms: {
        uProgress: { value: 0.0 },
        uYieldScale: { value: yieldScale },
      },
      vertexShader: `
        varying vec2 vUv;
        uniform float uProgress;
        void main() {
          vUv = uv * 2.0 - 1.0;
          float r = length(vUv);
          // Slight spherical curvature conforming to upper atmosphere + acoustic N-wave ripple displacement
          vec3 pos = position;
          pos.z -= r * r * 1.6;
          float waveFront = uProgress * 0.88;
          float ripple = exp(-pow((r - waveFront) * 18.0, 2.0)) * (1.0 - uProgress) * 0.65;
          pos.z += ripple;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        uniform float uProgress;
        uniform float uYieldScale;
        void main() {
          float r = length(vUv);
          if (r > 1.0 || uProgress >= 0.995) discard;

          float waveFront = 0.06 + pow(uProgress, 0.68) * 0.88;
          float secondaryFront = max(0.0, waveFront - 0.11);

          // Crisp primary Mach overpressure condensation shell (Wilson cloud / Schlieren refraction)
          float primaryRing = exp(-pow((r - waveFront) * 28.0, 2.0));
          // Secondary acoustic rarefaction / N-wave trailing vibration ripple
          float secondaryRing = exp(-pow((r - secondaryFront) * 36.0, 2.0)) * 0.52;
          // High-frequency acoustic pressure Mach vibration train
          float machVibration = max(0.0, cos((r - waveFront) * 95.0)) * exp(-pow((r - waveFront) * 12.0, 2.0)) * 0.32;

          // Brief initial radiative plasma ionization flash at t -> 0 that rapidly cools into a pure acoustic wave
          float coreFlash = exp(-pow(r * (3.5 + uProgress * 12.0), 2.0)) * pow(max(0.0, 1.0 - uProgress * 2.6), 2.0);

          // Angular atmospheric turbulence modulation
          float angle = atan(vUv.y, vUv.x);
          float turb = 0.84 + 0.16 * sin(angle * 11.0 + uProgress * 8.0) * cos(angle * 7.0 - r * 15.0);

          vec3 flashCol = vec3(1.0, 0.92, 0.78);
          vec3 plasmaAmber = vec3(0.98, 0.56, 0.22);
          vec3 sonicCyanWhite = vec3(0.78, 0.93, 1.0);

          vec3 waveCol = mix(plasmaAmber, sonicCyanWhite, smoothstep(0.08, 0.45, uProgress));
          vec3 col = mix(waveCol, flashCol, clamp(coreFlash * 1.4, 0.0, 1.0));

          // Smooth dissipation to 0 so no permanent ring stays on screen after the sonic boom passes
          float fadeOut = pow(max(0.0, 1.0 - uProgress), 1.35);
          float alpha = (primaryRing * 0.78 + secondaryRing + machVibration + coreFlash * 0.85) * turb * fadeOut;

          gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.88));
        }
      `,
      transparent: true,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const sonicWaveMesh = new THREE.Mesh(sonicPlaneGeo, sonicWaveMat);
    sonicWaveMesh.userData = { isAirburstSonicWave: true };
    sonicCluster.add(sonicWaveMesh);

    group.add(sonicCluster);
    return group;
  }

  // 2. OCEAN WATER CAVITY & 3D TSUNAMI WAVE RINGS REGIME
  if (regime === 'ocean_tsunami') {
    const surfacePos = latLonToVec3(lat, lon, earthRadius + 0.32);
    const localGroup = new THREE.Group();
    localGroup.position.copy(surfacePos);
    localGroup.lookAt(surfacePos.clone().multiplyScalar(2));
    group.add(localGroup);

    const cavityGeo = new THREE.CircleGeometry(craterRadiusUnits * 0.92, 64);
    const cavityMat = new THREE.MeshStandardMaterial({
      color: 0x082f49,
      emissive: new THREE.Color(0x0369a1),
      emissiveIntensity: 0.35,
      roughness: 0.2,
      metalness: 0.1,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.94,
    });
    const cavityMesh = new THREE.Mesh(cavityGeo, cavityMat);
    cavityMesh.position.z = -0.35;
    localGroup.add(cavityMesh);

    const steamCoreGeo = new THREE.CircleGeometry(craterRadiusUnits * 0.45, 48);
    const steamCoreMat = new THREE.MeshBasicMaterial({
      color: 0xe0f2fe,
      map: getDustParticleTexture(),
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const steamCore = new THREE.Mesh(steamCoreGeo, steamCoreMat);
    steamCore.position.z = -0.15;
    localGroup.add(steamCore);

    const crownGeo = new THREE.CylinderGeometry(
      craterRadiusUnits * 1.18,
      craterRadiusUnits * 0.88,
      craterRadiusUnits * 0.68,
      64,
      4,
      true
    );
    crownGeo.rotateX(Math.PI * 0.5);
    const cPos = crownGeo.attributes.position;
    const cv = new THREE.Vector3();
    for (let i = 0; i < cPos.count; i++) {
      cv.fromBufferAttribute(cPos, i);
      const ang = Math.atan2(cv.y, cv.x);
      if (cv.z > 0) {
        const spire = Math.sin(ang * 14) * 0.25 + Math.cos(ang * 23) * 0.18;
        cv.z *= 1.15 + spire;
      }
      cPos.setXYZ(i, cv.x, cv.y, cv.z);
    }
    crownGeo.computeVertexNormals();
    const crownMat = new THREE.MeshStandardMaterial({
      color: 0xbae6fd,
      emissive: new THREE.Color(0x0284c7),
      emissiveIntensity: 0.45,
      roughness: 0.25,
      metalness: 0.1,
      transparent: true,
      opacity: 0.86,
      side: THREE.DoubleSide,
    });
    const crownMesh = new THREE.Mesh(crownGeo, crownMat);
    crownMesh.position.z = craterRadiusUnits * 0.22;
    localGroup.add(crownMesh);

    for (let w = 0; w < 4; w++) {
      const waveRadius = craterRadiusUnits * (1.45 + w * 0.55);
      const waveTube = Math.max(0.12, craterRadiusUnits * (0.065 - w * 0.01));
      const waveGeo = new THREE.TorusGeometry(waveRadius, waveTube, 12, 64);
      const waveMat = new THREE.MeshStandardMaterial({
        color: w === 0 ? 0xe0f2fe : 0x38bdf8,
        emissive: new THREE.Color(0x0ea5e9),
        emissiveIntensity: 0.5 - w * 0.1,
        roughness: 0.2,
        transparent: true,
        opacity: 0.8 - w * 0.15,
      });
      const waveMesh = new THREE.Mesh(waveGeo, waveMat);
      waveMesh.userData = { isTsunamiRing: true, baseRadius: waveRadius, ringIndex: w };
      localGroup.add(waveMesh);
    }

    return group;
  }

  // -------------------------------------------------------------------------
  // 3. PHOTOREALISTIC 3D SPHERICAL-CAP CONTINENTAL CRATER BOWL & EJECTA BLANKET
  // Includes Oblique Elliptical Basin Elongation & Asymmetrical Downrange Ejecta!
  // -------------------------------------------------------------------------
  const isSimple = regime === 'simple_crater';
  const isExtinction = regime === 'crust_melt_extinction';
  const suite = getPhotorealisticCraterTextureSuite(
    isSimple ? 'simple_crater' : isExtinction ? 'crust_melt_extinction' : 'complex_crater'
  );

  // Basis vectors on the Earth sphere around (lat, lon)
  // Align tangent1 with the incoming trajectory's horizontal projection so downrange is +cosT and uprange is -cosT!
  const impactNormal = latLonToVec3(lat, lon, 1.0).normalize();
  const upRef =
    Math.abs(impactNormal.y) < 0.99
      ? new THREE.Vector3(0, 1, 0)
      : new THREE.Vector3(1, 0, 0);
  // In EarthViewport, incoming trajectory comes from +tangent toward target, so downrange is -tangent
  const rawTangent = new THREE.Vector3(0, 1, 0).cross(impactNormal).normalize();
  if (rawTangent.lengthSq() < 0.01) rawTangent.set(1, 0, 0);
  const tangent1 = rawTangent.clone().negate(); // +cosT = downrange direction!
  const tangent2 = new THREE.Vector3().crossVectors(impactNormal, tangent1).normalize(); // +sinT = crossrange

  // Outer extent covers the crater bowl (u <= 0.52) + raised rim (u ~ 0.52..0.60) + fading ejecta blanket (u <= 1.0)
  const outerExtentUnits = craterRadiusUnits * 1.92;
  const uRim = 0.52;

  const radialSteps = 64;
  const angularSteps = 96;
  const vertCount = (radialSteps + 1) * (angularSteps + 1);
  const positions = new Float32Array(vertCount * 3);
  const uvs = new Float32Array(vertCount * 2);
  const indices: number[] = [];

  const bowlDepthUnits = isSimple ? 3.8 : isExtinction ? 6.4 : 4.9;
  const rimHeightUnits = isSimple ? 1.55 : isExtinction ? 3.1 : 2.35;
  const asymmetry = result.ejecta_butterfly_asymmetry || 0;
  const ellipticity = result.crater_ellipticity || 1.0;

  let vPtr = 0;
  let uvPtr = 0;

  for (let rIdx = 0; rIdx <= radialSteps; rIdx++) {
    const u = rIdx / radialSteps; // 0 at center -> 1 at outer ejecta edge

    for (let aIdx = 0; aIdx <= angularSteps; aIdx++) {
      const theta = (aIdx / angularSteps) * Math.PI * 2;
      const cosT = Math.cos(theta); // +1 = downrange, -1 = uprange
      const sinT = Math.sin(theta); // ±1 = crossrange butterfly lobes

      // 1. True Elliptical Crater Basin (for u <= uRim) + Asymmetrical Downrange & Butterfly Ejecta (for u > uRim)
      // Ellipse polar formula along major axis (cosT): r(theta) = e / sqrt(cos^2(theta) + e^2 * sin^2(theta))
      const bowlEllipseStretch =
        ellipticity / Math.sqrt(cosT * cosT + ellipticity * ellipticity * sinT * sinT);
      // Slight downrange center offset for oblique impacts
      const downrangeShift = asymmetry * 0.16 * cosT;

      let dirStretch = bowlEllipseStretch + downrangeShift * Math.min(1, u / uRim);
      if (u > uRim && asymmetry > 0.05) {
        const ejectaFrac = (u - uRim) / (1.0 - uRim);
        // Downrange plume + bilateral crossrange butterfly lobes, with uprange forbidden zone (cosT < -0.35)
        const downrangeLobe = Math.max(0, cosT) * 0.72;
        const butterflyLobes = Math.pow(Math.abs(sinT), 1.2) * 0.85;
        const uprangeForbidden =
          cosT < -0.25 ? Math.max(0.28, 1.0 - asymmetry * Math.abs(cosT + 0.25) * 0.85) : 1.0;
        const ejectaPattern = (0.75 + downrangeLobe + butterflyLobes) * uprangeForbidden;
        dirStretch =
          bowlEllipseStretch * (1.0 - ejectaFrac) +
          ejectaFrac * (1.0 + asymmetry * (ejectaPattern - 0.85));
      }

      const arcRadiusUnits = u * outerExtentUnits * dirStretch;
      const angDist = Math.min(Math.PI * 0.42, arcRadiusUnits / earthRadius);

      // Multi-octave 3D vertex noise for rugged rocky rim and terraced walls
      const nx = u * cosT;
      const ny = u * sinT;
      const cragNoise =
        (fbm2D(nx * 6.5 + 4.1, ny * 6.5 + 8.3, 4) - 0.5) * 2.0;
      const ridgeDetail = ridgeNoise2D(nx * 11.0 - 2.4, ny * 11.0 + 5.7, 3);

      let radialElevation = 0.0;

      if (u < uRim) {
        // INSIDE THE 3D CONCAVE CRATER BOWL
        const w = u / uRim; // 0 at center -> 1 at rim crest
        // Oblique impacts excavate a steeper downrange wall and shallower uprange ramp
        const wallExponent = (isSimple ? 1.85 : 2.25) * (1.0 + asymmetry * cosT * 0.22);
        const bowlCurve = 1.0 - Math.pow(w, Math.max(1.3, wallExponent));
        radialElevation = -bowlDepthUnits * bowlCurve;

        // Stepped slump terraces on inner wall for complex & extinction craters
        if (!isSimple && w > 0.35 && w < 0.96) {
          const terracePhase = (w - 0.35) / 0.61;
          const stepWaves = Math.sin(terracePhase * Math.PI * (isExtinction ? 7 : 5));
          radialElevation += stepWaves * 0.42 * Math.sin(terracePhase * Math.PI);
        }

        // Rugged rocky wall relief
        radialElevation += cragNoise * 0.55 * w + (ridgeDetail - 0.4) * 0.45 * w;

        // Sculpted multi-peak central uplift massif for complex craters (NEVER a flat cone!)
        if (!isSimple && w < 0.28) {
          const peakW = w / 0.28;
          const upliftBell = Math.pow(Math.cos(peakW * Math.PI * 0.5), 1.6);
          const massifCrags = 0.65 + 0.75 * ridgeDetail + 0.35 * cragNoise;
          radialElevation += upliftBell * (bowlDepthUnits * (isExtinction ? 0.62 : 0.54)) * massifCrags;
        }
      } else {
        // RAISED OVERTURNED CRATER RIM & FADING EJECTA BLANKET
        const ejectaW = (u - uRim) / (1.0 - uRim); // 0 at rim crest -> 1 at outer edge
        const rimProfile = Math.exp(-Math.pow(ejectaW * 4.2, 1.8));
        // Downrange rim is piled higher by oblique momentum transfer; uprange rim is lower
        const obliqueRimBias = 1.0 + asymmetry * (0.32 * cosT + 0.18 * Math.abs(sinT));
        const rimJagged = (1.0 + cragNoise * 0.36 + (ridgeDetail - 0.5) * 0.28) * obliqueRimBias;
        const ejectaSlope = Math.pow(Math.max(0, 1.0 - ejectaW), 2.2) * 0.45 * obliqueRimBias;

        // Transitions smoothly from raised rim (+rimHeightUnits) down to +0.22 units flush with Earth surface
        radialElevation =
          rimHeightUnits * rimProfile * rimJagged +
          ejectaSlope * (1.0 - rimProfile) +
          0.22;
      }

      // Compute exact 3D spherical position on the Earth globe
      const sinA = Math.sin(angDist);
      const cosA = Math.cos(angDist);
      const dirX =
        impactNormal.x * cosA + (tangent1.x * cosT + tangent2.x * sinT) * sinA;
      const dirY =
        impactNormal.y * cosA + (tangent1.y * cosT + tangent2.y * sinT) * sinA;
      const dirZ =
        impactNormal.z * cosA + (tangent1.z * cosT + tangent2.z * sinT) * sinA;

      const finalR = earthRadius + radialElevation;
      positions[vPtr++] = dirX * finalR;
      positions[vPtr++] = dirY * finalR;
      positions[vPtr++] = dirZ * finalR;

      uvs[uvPtr++] = 0.5 + 0.5 * u * cosT;
      uvs[uvPtr++] = 0.5 + 0.5 * u * sinT;
    }
  }

  for (let rIdx = 0; rIdx < radialSteps; rIdx++) {
    for (let aIdx = 0; aIdx < angularSteps; aIdx++) {
      const row1 = rIdx * (angularSteps + 1) + aIdx;
      const row2 = (rIdx + 1) * (angularSteps + 1) + aIdx;

      indices.push(row1, row2, row1 + 1);
      indices.push(row1 + 1, row2, row2 + 1);
    }
  }

  const craterGeo = new THREE.BufferGeometry();
  craterGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  craterGeo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  craterGeo.setIndex(indices);
  craterGeo.computeVertexNormals();

  // Photorealistic PBR Material that responds directly to the scene's Directional Sun Light!
  const craterMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: suite.albedoTex,
    normalMap: suite.normalTex,
    normalScale: new THREE.Vector2(3.2, 3.2),
    bumpMap: suite.roughnessTex,
    bumpScale: 1.6,
    roughnessMap: suite.roughnessTex,
    roughness: 0.94,
    metalness: 0.06,
    emissiveMap: suite.emissiveTex,
    emissive: new THREE.Color(0xff5500),
    emissiveIntensity: isExtinction ? 2.1 : isSimple ? 0.95 : 1.55,
    alphaMap: suite.alphaTex,
    transparent: true,
    depthWrite: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });

  const craterMesh = new THREE.Mesh(craterGeo, craterMat);
  craterMesh.renderOrder = 2;
  group.add(craterMesh);

  // -------------------------------------------------------------------------
  // 4. SCATTERED 3D PULVERIZED ROCK & ASH DEBRIS PARTICLES (Replaces Yellow Zigzag Tubes!)
  // Blends dusty radial ejecta debris into the surrounding terrain
  // -------------------------------------------------------------------------
  const debrisCount = isExtinction ? 420 : isSimple ? 180 : 300;
  const debrisPositions = new Float32Array(debrisCount * 3);
  const debrisColors = new Float32Array(debrisCount * 3);

  let dSeed = Math.floor(Math.abs(lat * 1000 + lon * 100)) + 4096;
  const dRand = () => {
    dSeed = (dSeed * 16807) % 2147483647;
    return (dSeed - 1) / 2147483646;
  };

  for (let i = 0; i < debrisCount; i++) {
    // Cluster debris along radial rays outside the rim (u from 0.48 to 1.18)
    const rayClusterAngle =
      Math.floor(dRand() * 18) * ((Math.PI * 2) / 18) + (dRand() - 0.5) * 0.28;
    const cosA = Math.cos(rayClusterAngle);
    const sinA = Math.sin(rayClusterAngle);

    let uDist = 0.50 + Math.pow(dRand(), 1.35) * 0.65;
    if (asymmetry > 0.1) {
      const butterfly = 0.65 + 0.65 * Math.abs(sinA);
      const forbidden = cosA < -0.5 ? 0.45 : 1.0;
      uDist *= (1 - asymmetry) + asymmetry * butterfly * forbidden;
    }

    const arcDist = (uDist * outerExtentUnits) / earthRadius;
    const sA = Math.sin(arcDist);
    const cA = Math.cos(arcDist);

    const dx = impactNormal.x * cA + (tangent1.x * cosA + tangent2.x * sinA) * sA;
    const dy = impactNormal.y * cA + (tangent1.y * cosA + tangent2.y * sinA) * sA;
    const dz = impactNormal.z * cA + (tangent1.z * cosA + tangent2.z * sinA) * sA;

    const rSurface = earthRadius + 0.45 + (1.0 - Math.min(1, uDist)) * 0.55;
    debrisPositions[i * 3] = dx * rSurface;
    debrisPositions[i * 3 + 1] = dy * rSurface;
    debrisPositions[i * 3 + 2] = dz * rSurface;

    // Mix of dark charcoal ash, warm pulverized umber rock, and occasional glowing ember near the rim
    const isHotEmber = uDist < 0.64 && dRand() > 0.72;
    if (isHotEmber) {
      debrisColors[i * 3] = 0.85;
      debrisColors[i * 3 + 1] = 0.28;
      debrisColors[i * 3 + 2] = 0.06;
    } else {
      const shade = 0.16 + dRand() * 0.26;
      debrisColors[i * 3] = shade * 1.18;
      debrisColors[i * 3 + 1] = shade * 0.96;
      debrisColors[i * 3 + 2] = shade * 0.80;
    }
  }

  const debrisGeo = new THREE.BufferGeometry();
  debrisGeo.setAttribute('position', new THREE.BufferAttribute(debrisPositions, 3));
  debrisGeo.setAttribute('color', new THREE.BufferAttribute(debrisColors, 3));

  const debrisMat = new THREE.PointsMaterial({
    size: Math.max(0.85, craterRadiusUnits * 0.095),
    map: getDustParticleTexture(),
    vertexColors: true,
    transparent: true,
    opacity: 0.78,
    depthWrite: false,
  });

  const debrisPoints = new THREE.Points(debrisGeo, debrisMat);
  debrisPoints.renderOrder = 3;
  group.add(debrisPoints);

  return group;
}
