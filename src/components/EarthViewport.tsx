import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  ImpactSimulationResult,
  DeflectionResult,
  AsteroidMorphologySpec,
  AtmosphericEntryTelemetry,
  SplitCamMode,
} from '../types';
import {
  getAsteroidMorphologySpec,
  calculateAtmosphericEntryState,
  isOceanCoordinate,
  estimateTerrainElevationM,
} from '../utils/impactPhysics';
import {
  buildScientificAsteroidRig,
  buildRegimeSpecific3DCrater,
  getAsteroidVisualScale,
  BuiltAsteroidRig,
} from '../utils/asteroid3DGenerator';

export type CameraViewPreset = 'orbital' | 'asteroid' | 'horizon' | 'moon';

export interface EarthViewportProps {
  selectedLat: number;
  selectedLon: number;
  selectedNeoId?: string;
  onSelectLocation: (lat: number, lon: number, label?: string) => void;
  simulationTrigger: number;
  resetTrigger: number;
  centerTrigger: number;
  cameraPreset?: CameraViewPreset;
  splitCamMode?: SplitCamMode;
  onChangeSplitCamMode?: (mode: SplitCamMode) => void;
  activeResult: ImpactSimulationResult;
  deflectionResult: DeflectionResult;
  showDeflectionArc: boolean;
  manualScrubProgress?: number | null;
  onSimulationPhaseChange?: (phase: 'idle' | 'approaching' | 'detonating' | 'complete') => void;
}

const EARTH_RADIUS = 100;

export function latLonToVector3(
  lat: number,
  lon: number,
  radius: number,
  out = new THREE.Vector3()
): THREE.Vector3 {
  const safeLat = Number.isFinite(lat) ? lat : 35.03;
  const safeLon = Number.isFinite(lon) ? lon : -111.02;
  const phi = (90 - safeLat) * (Math.PI / 180);
  const theta = (safeLon + 180) * (Math.PI / 180);

  const x = -(radius * Math.sin(phi) * Math.cos(theta));
  const z = radius * Math.sin(phi) * Math.sin(theta);
  const y = radius * Math.cos(phi);

  return out.set(x, y, z);
}

export function vector3ToLatLon(vec: THREE.Vector3): { lat: number; lon: number } {
  const len = vec.length() || 1;
  const nx = vec.x / len;
  const ny = vec.y / len;
  const nz = vec.z / len;
  const lat = 90 - Math.acos(Math.max(-1, Math.min(1, ny))) * (180 / Math.PI);
  const lon = (Math.atan2(nz, -nx) * 180) / Math.PI - 180;
  return {
    lat: Math.round(lat * 100) / 100,
    lon: Math.round((lon < -180 ? lon + 360 : lon) * 100) / 100,
  };
}

function createAsteroidPBRTextures(maxAnisotropy: number) {
  const w = 512;
  const h = 256;

  const albedoCanvas = document.createElement('canvas');
  albedoCanvas.width = w;
  albedoCanvas.height = h;
  const aCtx = albedoCanvas.getContext('2d')!;

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = w;
  bumpCanvas.height = h;
  const bCtx = bumpCanvas.getContext('2d')!;

  const emissiveCanvas = document.createElement('canvas');
  emissiveCanvas.width = w;
  emissiveCanvas.height = h;
  const eCtx = emissiveCanvas.getContext('2d')!;

  aCtx.fillStyle = '#5c554d';
  aCtx.fillRect(0, 0, w, h);
  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, w, h);
  eCtx.fillStyle = '#000000';
  eCtx.fillRect(0, 0, w, h);

  let seed = 1337;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  for (let i = 0; i < 240; i++) {
    const cx = rand() * w;
    const cy = rand() * h;
    const r = 3 + Math.pow(rand(), 3) * 28;

    const bGrad = bCtx.createRadialGradient(cx, cy, r * 0.1, cx, cy, r);
    bGrad.addColorStop(0, '#121212');
    bGrad.addColorStop(0.7, '#2a2a2a');
    bGrad.addColorStop(0.88, '#f0f0f0');
    bGrad.addColorStop(1, '#808080');
    bCtx.fillStyle = bGrad;
    bCtx.beginPath();
    bCtx.arc(cx, cy, r, 0, Math.PI * 2);
    bCtx.fill();

    const shade = Math.floor(68 + rand() * 58);
    const aGrad = aCtx.createRadialGradient(cx, cy, r * 0.1, cx, cy, r);
    aGrad.addColorStop(0, `rgb(${shade - 18}, ${shade - 20}, ${shade - 22})`);
    aGrad.addColorStop(0.84, `rgb(${shade + 28}, ${shade + 24}, ${shade + 18})`);
    aGrad.addColorStop(1, 'rgba(92,85,77,0)');
    aCtx.fillStyle = aGrad;
    aCtx.beginPath();
    aCtx.arc(cx, cy, r, 0, Math.PI * 2);
    aCtx.fill();
  }

  // Subtle thermal ablation fracture veins (only visible when emissiveIntensity > 0 inside atmosphere)
  eCtx.strokeStyle = '#ffffff';
  eCtx.lineWidth = 2.2;
  for (let i = 0; i < 28; i++) {
    let x = rand() * w;
    let y = rand() * h;
    eCtx.beginPath();
    eCtx.moveTo(x, y);
    for (let s = 0; s < 6; s++) {
      x += (rand() - 0.5) * 38;
      y += (rand() - 0.5) * 26;
      eCtx.lineTo(x, y);
    }
    eCtx.stroke();
  }

  const albedoTex = new THREE.CanvasTexture(albedoCanvas);
  albedoTex.colorSpace = THREE.SRGBColorSpace;
  albedoTex.anisotropy = maxAnisotropy;

  const bumpTex = new THREE.CanvasTexture(bumpCanvas);
  bumpTex.anisotropy = maxAnisotropy;

  const emissiveTex = new THREE.CanvasTexture(emissiveCanvas);
  emissiveTex.colorSpace = THREE.SRGBColorSpace;
  emissiveTex.anisotropy = maxAnisotropy;

  return { albedoTex, bumpTex, emissiveTex };
}

function createSolarFlareTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  const rad = ctx.createRadialGradient(128, 128, 2, 128, 128, 125);
  rad.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
  rad.addColorStop(0.08, 'rgba(255, 242, 210, 0.95)');
  rad.addColorStop(0.22, 'rgba(255, 180, 95, 0.45)');
  rad.addColorStop(0.55, 'rgba(217, 119, 6, 0.12)');
  rad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = rad;
  ctx.fillRect(0, 0, 256, 256);

  const streak = ctx.createLinearGradient(0, 128, 256, 128);
  streak.addColorStop(0, 'rgba(245, 158, 11, 0)');
  streak.addColorStop(0.35, 'rgba(251, 191, 36, 0.38)');
  streak.addColorStop(0.5, 'rgba(255, 250, 235, 0.95)');
  streak.addColorStop(0.65, 'rgba(251, 191, 36, 0.38)');
  streak.addColorStop(1, 'rgba(245, 158, 11, 0)');
  ctx.fillStyle = streak;
  ctx.fillRect(0, 123, 256, 10);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createPlanetaryBacklightTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  const rad = ctx.createRadialGradient(128, 128, 30, 128, 128, 128);
  rad.addColorStop(0, 'rgba(56, 189, 248, 0.38)');
  rad.addColorStop(0.45, 'rgba(14, 116, 144, 0.18)');
  rad.addColorStop(0.75, 'rgba(234, 88, 12, 0.06)');
  rad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = rad;
  ctx.fillRect(0, 0, 256, 256);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createGeodesicCircleGeometry(
  latDeg: number,
  lonDeg: number,
  radiusKm: number,
  globeRadius: number,
  segments = 128
): THREE.BufferGeometry {
  const angularRadius = Math.min(Math.PI * 0.85, Math.max(0.008, radiusKm / 6371));
  const centerVec = latLonToVector3(latDeg, lonDeg, 1).normalize();
  const up =
    Math.abs(centerVec.y) < 0.99 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const tangent1 = new THREE.Vector3().crossVectors(up, centerVec).normalize();
  const tangent2 = new THREE.Vector3().crossVectors(centerVec, tangent1).normalize();

  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    const ringDir = new THREE.Vector3()
      .addScaledVector(centerVec, Math.cos(angularRadius))
      .addScaledVector(tangent1, Math.sin(angularRadius) * Math.cos(theta))
      .addScaledVector(tangent2, Math.sin(angularRadius) * Math.sin(theta))
      .normalize();
    points.push(ringDir.multiplyScalar(globeRadius));
  }
  return new THREE.BufferGeometry().setFromPoints(points);
}

function createBlindingImpactFlashTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Core blinding white-blue radiative flash (outshines the sun at t = 0..2s)
  const rad = ctx.createRadialGradient(256, 256, 2, 256, 256, 250);
  rad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
  rad.addColorStop(0.12, 'rgba(240, 249, 255, 0.98)');
  rad.addColorStop(0.28, 'rgba(125, 211, 252, 0.85)');
  rad.addColorStop(0.52, 'rgba(56, 189, 248, 0.38)');
  rad.addColorStop(0.78, 'rgba(14, 165, 233, 0.10)');
  rad.addColorStop(1.0, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = rad;
  ctx.fillRect(0, 0, 512, 512);

  // Horizontal & vertical anamorphic orbital diffraction spikes
  const hStreak = ctx.createLinearGradient(0, 256, 512, 256);
  hStreak.addColorStop(0.0, 'rgba(56, 189, 248, 0)');
  hStreak.addColorStop(0.32, 'rgba(186, 230, 253, 0.55)');
  hStreak.addColorStop(0.5, 'rgba(255, 255, 255, 1.0)');
  hStreak.addColorStop(0.68, 'rgba(186, 230, 253, 0.55)');
  hStreak.addColorStop(1.0, 'rgba(56, 189, 248, 0)');
  ctx.fillStyle = hStreak;
  ctx.fillRect(0, 246, 512, 20);

  const vStreak = ctx.createLinearGradient(256, 0, 256, 512);
  vStreak.addColorStop(0.0, 'rgba(56, 189, 248, 0)');
  vStreak.addColorStop(0.38, 'rgba(186, 230, 253, 0.42)');
  vStreak.addColorStop(0.5, 'rgba(255, 255, 255, 0.95)');
  vStreak.addColorStop(0.62, 'rgba(186, 230, 253, 0.42)');
  vStreak.addColorStop(1.0, 'rgba(56, 189, 248, 0)');
  ctx.fillStyle = vStreak;
  ctx.fillRect(249, 0, 14, 512);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export const EarthViewport: React.FC<EarthViewportProps> = ({
  selectedLat,
  selectedLon,
  selectedNeoId = 'impactor-2025',
  onSelectLocation,
  simulationTrigger,
  resetTrigger,
  centerTrigger,
  cameraPreset = 'orbital',
  splitCamMode = 'auto',
  onChangeSplitCamMode,
  activeResult,
  deflectionResult,
  showDeflectionArc,
  manualScrubProgress = null,
  onSimulationPhaseChange,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const pipViewportRef = useRef<HTMLDivElement | null>(null);
  const hoverTooltipRef = useRef<HTMLDivElement | null>(null);
  const hoverCoordsTextRef = useRef<HTMLElement | null>(null);
  const hoverSurfaceTextRef = useRef<HTMLElement | null>(null);
  const hoverElevationTextRef = useRef<HTMLElement | null>(null);

  // Live telemetry state for 2D Topo Cross-Section PiP HUD
  const [splitScreenActive, setSplitScreenActive] = useState<boolean>(false);
  const [isPipCollapsed, setIsPipCollapsed] = useState<boolean>(false);
  const isPipCollapsedRef = useRef<boolean>(false);
  const [entryHudTelemetry, setEntryHudTelemetry] = useState<AtmosphericEntryTelemetry>(() =>
    calculateAtmosphericEntryState(0.84, activeResult)
  );

  useEffect(() => {
    isPipCollapsedRef.current = isPipCollapsed;
  }, [isPipCollapsed]);

  const morphologySpec: AsteroidMorphologySpec = getAsteroidMorphologySpec(
    selectedNeoId,
    activeResult.composition,
    activeResult.diameter_m
  );

  const stateRef = useRef({
    selectedLat,
    selectedLon,
    selectedNeoId,
    morphologySpec,
    activeResult,
    deflectionResult,
    showDeflectionArc,
    manualScrubProgress,
    onSelectLocation,
    onSimulationPhaseChange,
    cameraPreset,
    splitCamMode,
  });

  useEffect(() => {
    stateRef.current = {
      selectedLat,
      selectedLon,
      selectedNeoId,
      morphologySpec,
      activeResult,
      deflectionResult,
      showDeflectionArc,
      manualScrubProgress,
      onSelectLocation,
      onSimulationPhaseChange,
      cameraPreset,
      splitCamMode,
    };
  }, [
    selectedLat,
    selectedLon,
    selectedNeoId,
    morphologySpec,
    activeResult,
    deflectionResult,
    showDeflectionArc,
    manualScrubProgress,
    onSelectLocation,
    onSimulationPhaseChange,
    cameraPreset,
    splitCamMode,
  ]);

  const simAnimRef = useRef<{
    active: boolean;
    progress: number;
    detonatedTriggered: boolean;
    hasImpacted: boolean;
  }>({
    active: false,
    progress: 0,
    detonatedTriggered: false,
    hasImpacted: false,
  });

  interface EjectaBoulderData {
    velDir: THREE.Vector3;
    speed: number;
    rotSpeed: THREE.Vector3;
    scale: number;
  }

  const sceneObjectsRef = useRef<{
    scene?: THREE.Scene;
    earthGroup?: THREE.Group;
    earthMesh?: THREE.Mesh;
    earthGeo?: THREE.SphereGeometry;
    baseEarthPos?: Float32Array;
    cloudMesh?: THREE.Mesh;
    cloudGeo?: THREE.SphereGeometry;
    baseCloudPos?: Float32Array;
    dustVeilMesh?: THREE.Mesh;
    markerGroup?: THREE.Group;
    hoverReticleGroup?: THREE.Group;
    craterGroup?: THREE.Group;
    ringsGroup?: THREE.Group;
    trajectoryLine?: THREE.Mesh;
    trajectoryPulsesGroup?: THREE.Group;
    deflectedLine?: THREE.Mesh;
    asteroidAnchorGroup?: THREE.Group;
    asteroidRig?: BuiltAsteroidRig;
    dartProbeGroup?: THREE.Group;
    explosionLight?: THREE.PointLight;
    fireballMesh?: THREE.Mesh;
    shockDomeMesh?: THREE.Mesh;
    plumeGroup?: THREE.Group;
    vacuumTubeMesh?: THREE.Mesh;
    blindingFlashSprite?: THREE.Sprite;
    vaporBubbleMesh?: THREE.Mesh;
    exosphericJetMesh?: THREE.Mesh;
    ejectaCurtainMesh?: THREE.Mesh;
    ejectaShadowRingMesh?: THREE.Mesh;
    moltenScarMesh?: THREE.Mesh;
    firestormEnvelopeMesh?: THREE.Mesh;
    ejectaInstanced?: THREE.InstancedMesh;
    ejectaData?: EjectaBoulderData[];
    astAlbedo?: THREE.Texture;
    astBump?: THREE.Texture;
    astEmissive?: THREE.Texture;
    controls?: OrbitControls;
    camera?: THREE.PerspectiveCamera;
    entryCamera?: THREE.PerspectiveCamera;
    isSplitActiveRef?: boolean;
    deformEarthAndCloudsForCrater?: (
      lat: number,
      lon: number,
      craterRadiusUnits: number,
      excavateStrength: number,
      seismicWavePhase: number,
      regime: ImpactSimulationResult['impact_regime']
    ) => void;
    cameraTransition?: {
      active: boolean;
      startPos: THREE.Vector3;
      endPos: THREE.Vector3;
      startTarget: THREE.Vector3;
      endTarget: THREE.Vector3;
      progress: number;
    };
  }>({});

  const resetPlanetToPristine = () => {
    const {
      craterGroup,
      ringsGroup,
      ejectaInstanced,
      plumeGroup,
      fireballMesh,
      shockDomeMesh,
      dustVeilMesh,
      explosionLight,
      vacuumTubeMesh,
      blindingFlashSprite,
      vaporBubbleMesh,
      exosphericJetMesh,
      ejectaCurtainMesh,
      ejectaShadowRingMesh,
      moltenScarMesh,
      firestormEnvelopeMesh,
      deformEarthAndCloudsForCrater,
    } = sceneObjectsRef.current;

    simAnimRef.current.hasImpacted = false;
    simAnimRef.current.active = false;
    simAnimRef.current.progress = 0;
    simAnimRef.current.detonatedTriggered = false;

    if (deformEarthAndCloudsForCrater) {
      deformEarthAndCloudsForCrater(
        selectedLat,
        selectedLon,
        8,
        0,
        0,
        activeResult.impact_regime
      );
    }
    if (craterGroup) craterGroup.visible = false;
    if (ringsGroup) ringsGroup.visible = false;
    if (ejectaInstanced) ejectaInstanced.visible = false;
    if (plumeGroup) plumeGroup.visible = false;
    if (dustVeilMesh) {
      dustVeilMesh.visible = false;
      (dustVeilMesh.material as THREE.MeshStandardMaterial).opacity = 0;
    }
    if (fireballMesh) (fireballMesh.material as THREE.MeshBasicMaterial).opacity = 0;
    if (shockDomeMesh) {
      const sMat = shockDomeMesh.material as THREE.ShaderMaterial;
      if (sMat.uniforms?.uProgress) sMat.uniforms.uProgress.value = 1.0;
    }
    if (vacuumTubeMesh) vacuumTubeMesh.visible = false;
    if (blindingFlashSprite) {
      blindingFlashSprite.visible = false;
      (blindingFlashSprite.material as THREE.SpriteMaterial).opacity = 0;
    }
    if (vaporBubbleMesh) vaporBubbleMesh.visible = false;
    if (exosphericJetMesh) exosphericJetMesh.visible = false;
    if (ejectaCurtainMesh) ejectaCurtainMesh.visible = false;
    if (ejectaShadowRingMesh) ejectaShadowRingMesh.visible = false;
    if (moltenScarMesh) moltenScarMesh.visible = false;
    if (firestormEnvelopeMesh) {
      firestormEnvelopeMesh.visible = false;
      const fMat = firestormEnvelopeMesh.material as THREE.ShaderMaterial;
      if (fMat.uniforms?.uProgress) fMat.uniforms.uProgress.value = 0.0;
    }
    if (explosionLight) explosionLight.intensity = 0;
    setEntryHudTelemetry(calculateAtmosphericEntryState(0.84, stateRef.current.activeResult));
  };

  useEffect(() => {
    resetPlanetToPristine();
  }, [resetTrigger]);

  useEffect(() => {
    if (simulationTrigger <= 0) return;

    resetPlanetToPristine();

    simAnimRef.current = {
      active: true,
      progress: 0,
      detonatedTriggered: false,
      hasImpacted: false,
    };
    stateRef.current.onSimulationPhaseChange?.('approaching');

    const { cameraTransition } = sceneObjectsRef.current;
    if (cameraTransition) {
      cameraTransition.active = false;
    }
  }, [simulationTrigger]);

  // Rebuild the 3D Scientific Asteroid Rig whenever NEO preset, composition, or diameter changes
  useEffect(() => {
    const {
      asteroidAnchorGroup,
      astAlbedo,
      astBump,
      astEmissive,
    } = sceneObjectsRef.current;
    if (!asteroidAnchorGroup || !astAlbedo || !astBump || !astEmissive) return;

    while (asteroidAnchorGroup.children.length > 0) {
      const child = asteroidAnchorGroup.children[0];
      asteroidAnchorGroup.remove(child);
    }

    const spec = getAsteroidMorphologySpec(
      selectedNeoId,
      activeResult.composition,
      activeResult.diameter_m
    );
    const newRig = buildScientificAsteroidRig(
      spec,
      activeResult.diameter_m,
      astAlbedo,
      astBump,
      astEmissive
    );
    // Permanently hide the old atmospheric entry bow-shock cone & plasma wakes per user request
    newRig.bowShockMesh.visible = false;
    newRig.plasmaWakeInner.visible = false;
    newRig.plasmaWakeOuter.visible = false;
    newRig.entryCorridorGroup.visible = false;

    asteroidAnchorGroup.add(newRig.rootGroup);
    sceneObjectsRef.current.asteroidRig = newRig;

    if (!simAnimRef.current.active) {
      const targetSample = simAnimRef.current.hasImpacted ? 0.88 : 0.84;
      setEntryHudTelemetry(calculateAtmosphericEntryState(targetSample, activeResult));
    }
  }, [selectedNeoId, activeResult.composition, activeResult.diameter_m, activeResult.velocity_km_s]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#040406');

    const camera = new THREE.PerspectiveCamera(38, width / height, 1, 5000);
    const entryCamera = new THREE.PerspectiveCamera(40, (width * 0.3) / height, 0.5, 2500);

    const initTarget = latLonToVector3(selectedLat, selectedLon, EARTH_RADIUS);
    const initNorm = initTarget.clone().normalize();
    const initTangent = new THREE.Vector3(0, 1, 0).cross(initNorm).normalize();
    const initBitangent = initNorm.clone().cross(initTangent).normalize();
    camera.position
      .copy(initNorm.clone().multiplyScalar(256))
      .add(initBitangent.clone().multiplyScalar(78))
      .add(new THREE.Vector3(0, 28, 0));

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target
      .copy(initTarget.clone().multiplyScalar(0.28))
      .add(new THREE.Vector3(0, -18, 0));
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.minDistance = 114;
    controls.maxDistance = 680;
    controls.rotateSpeed = 0.65;
    controls.enablePan = false;
    controls.autoRotate = false;
    controls.update();

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x221f1d, 0.95);
    scene.add(ambientLight);

    const hemiLight = new THREE.HemisphereLight(0xfdba74, 0x090807, 0.55);
    scene.add(hemiLight);

    const sunPos = initNorm
      .clone()
      .multiplyScalar(380)
      .add(initTangent.clone().multiplyScalar(290))
      .add(new THREE.Vector3(0, 160, 0));
    const sunDir = sunPos.clone().normalize();

    const sunLight = new THREE.DirectionalLight(0xfff7ed, 3.8);
    sunLight.position.copy(sunPos);
    scene.add(sunLight);

    const rimLight = new THREE.DirectionalLight(0xd97706, 1.35);
    rimLight.position.copy(sunPos.clone().multiplyScalar(-0.8));
    scene.add(rimLight);

    // Deep Cosmic Atmospheric Backlight Glow behind the Earth
    const backlightTex = createPlanetaryBacklightTexture();
    const backlightMat = new THREE.SpriteMaterial({
      map: backlightTex,
      color: 0xffffff,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const backlightSprite = new THREE.Sprite(backlightMat);
    backlightSprite.scale.set(340, 340, 1);
    scene.add(backlightSprite);

    // 3D Anamorphic Sun Billboard
    const solarFlareTex = createSolarFlareTexture();
    const sunSpriteMat = new THREE.SpriteMaterial({
      map: solarFlareTex,
      color: 0xffffff,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const sunSprite = new THREE.Sprite(sunSpriteMat);
    sunSprite.position.copy(sunPos.clone().multiplyScalar(2.2));
    sunSprite.scale.set(420, 420, 1);
    scene.add(sunSprite);

    const explosionLight = new THREE.PointLight(0xff5500, 0, 280, 1.3);
    scene.add(explosionLight);

    // Multi-layered 3D Starfield
    const starGeo = new THREE.BufferGeometry();
    const starCount = 3600;
    const starPositions = new Float32Array(starCount * 3);
    const starColors = new Float32Array(starCount * 3);

    for (let i = 0; i < starCount; i++) {
      const r = 1100 + Math.random() * 1400;
      const theta = Math.random() * Math.PI * 2;
      const isBand = i < 1200;
      const phi = isBand
        ? Math.PI * 0.5 + (Math.random() - 0.5) * 0.32
        : Math.acos(2 * Math.random() - 1);

      starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      starPositions[i * 3 + 2] = r * Math.cos(phi);

      const tint = Math.random();
      if (tint > 0.78) {
        starColors[i * 3] = 1.0;
        starColors[i * 3 + 1] = 0.78;
        starColors[i * 3 + 2] = 0.52;
      } else if (tint > 0.58) {
        starColors[i * 3] = 0.85;
        starColors[i * 3 + 1] = 0.82;
        starColors[i * 3 + 2] = 0.78;
      } else {
        const b = 0.62 + Math.random() * 0.35;
        starColors[i * 3] = b;
        starColors[i * 3 + 1] = b * 0.96;
        starColors[i * 3 + 2] = b * 0.92;
      }
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(starColors, 3));

    const starMat = new THREE.PointsMaterial({
      size: 1.85,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      sizeAttenuation: true,
    });
    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);

    const earthGroup = new THREE.Group();
    scene.add(earthGroup);

    const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const texLoader = new THREE.TextureLoader();

    const blueMarbleTex = texLoader.load('/textures/earth-blue-marble.jpg');
    blueMarbleTex.colorSpace = THREE.SRGBColorSpace;
    blueMarbleTex.anisotropy = maxAniso;

    const normalTex = texLoader.load('/textures/earth-normal.jpg');
    normalTex.anisotropy = maxAniso;

    const topoTex = texLoader.load('/textures/earth-topology.png');
    topoTex.anisotropy = maxAniso;

    const nightTex = texLoader.load('/textures/earth-night.jpg');
    nightTex.colorSpace = THREE.SRGBColorSpace;
    nightTex.anisotropy = maxAniso;

    const cloudsTex = texLoader.load('/textures/earth-clouds.png');
    cloudsTex.colorSpace = THREE.SRGBColorSpace;
    cloudsTex.anisotropy = maxAniso;

    // 1. 3D Displaced Earth Mesh
    const earthGeo = new THREE.SphereGeometry(EARTH_RADIUS, 128, 128);
    const baseEarthPos = new Float32Array(earthGeo.attributes.position.array);

    const earthMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: blueMarbleTex,
      normalMap: normalTex,
      normalScale: new THREE.Vector2(2.8, 2.8),
      bumpMap: topoTex,
      bumpScale: 3.4,
      displacementMap: topoTex,
      displacementScale: 1.65,
      displacementBias: -0.25,
      emissiveMap: nightTex,
      emissive: new THREE.Color(0xffb357),
      emissiveIntensity: 0.62,
      roughness: 0.5,
      metalness: 0.14,
      envMapIntensity: 0.25,
    });

    const waterImg = new Image();
    waterImg.crossOrigin = 'anonymous';
    waterImg.onload = () => {
      const rCanvas = document.createElement('canvas');
      rCanvas.width = 1024;
      rCanvas.height = 512;
      const rCtx = rCanvas.getContext('2d');
      if (rCtx) {
        rCtx.drawImage(waterImg, 0, 0, 1024, 512);
        const imgData = rCtx.getImageData(0, 0, 1024, 512);
        const d = imgData.data;
        for (let i = 0; i < d.length; i += 4) {
          const isWater = d[i] > 128;
          const roughVal = isWater ? 44 : 228;
          d[i] = roughVal;
          d[i + 1] = roughVal;
          d[i + 2] = roughVal;
        }
        rCtx.putImageData(imgData, 0, 0);
        const roughMap = new THREE.CanvasTexture(rCanvas);
        roughMap.anisotropy = maxAniso;
        earthMat.roughnessMap = roughMap;
        earthMat.roughness = 1.0;
        earthMat.needsUpdate = true;
      }
    };
    waterImg.src = '/textures/earth-water.png';

    const earthMesh = new THREE.Mesh(earthGeo, earthMat);
    earthGroup.add(earthMesh);

    // 2. Cloud Cast-Shadow Layer
    const cloudShadowGeo = new THREE.SphereGeometry(EARTH_RADIUS + 0.9, 64, 64);
    const cloudShadowMat = new THREE.MeshBasicMaterial({
      map: cloudsTex,
      alphaMap: cloudsTex,
      color: 0x01040d,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
    });
    const cloudShadowMesh = new THREE.Mesh(cloudShadowGeo, cloudShadowMat);
    cloudShadowMesh.rotation.y = 0.008;
    cloudShadowMesh.rotation.x = -0.005;
    earthGroup.add(cloudShadowMesh);

    // 3. Elevated 3D Volumetric Cloud Deck
    const cloudGeo = new THREE.SphereGeometry(EARTH_RADIUS + 2.1, 84, 84);
    const baseCloudPos = new Float32Array(cloudGeo.attributes.position.array);
    const cloudMat = new THREE.MeshStandardMaterial({
      map: cloudsTex,
      alphaMap: cloudsTex,
      bumpMap: cloudsTex,
      bumpScale: 0.9,
      transparent: true,
      opacity: 0.88,
      roughness: 0.85,
      metalness: 0.0,
      depthWrite: false,
    });
    const cloudMesh = new THREE.Mesh(cloudGeo, cloudMat);
    earthGroup.add(cloudMesh);

    // Global Stratospheric Silicate Dust Veil (For 10km K-Pg Crust Melt Extinction Regime)
    const dustVeilGeo = new THREE.SphereGeometry(EARTH_RADIUS + 3.1, 64, 64);
    const dustVeilMat = new THREE.MeshStandardMaterial({
      color: 0x451a03,
      emissive: new THREE.Color(0x9a3412),
      emissiveIntensity: 0.35,
      roughness: 0.95,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const dustVeilMesh = new THREE.Mesh(dustVeilGeo, dustVeilMat);
    dustVeilMesh.visible = false;
    earthGroup.add(dustVeilMesh);

    /**
     * Regime-Aware 3D Vertex Deformation of Earth & Cloud Meshes upon Asteroid Impact:
     * - 'airburst': ZERO ground vertex excavation; only parts the 3D cloud deck from the descending blast wave
     * - 'simple_crater': Clean paraboloidal simple bowl (ZERO central peak)
     * - 'complex_crater' / 'crust_melt_extinction': Deep terraced basin + 3D central uplift peak + antipodal seismic wave
     * - 'ocean_tsunami': Transient acoustic water cavity + concentric gravity wave ripples
     */
    const deformEarthAndCloudsForCrater = (
      lat: number,
      lon: number,
      craterRadiusUnits: number,
      excavateStrength: number,
      seismicWavePhase: number,
      regime: ImpactSimulationResult['impact_regime']
    ) => {
      const impactDir = latLonToVector3(lat, lon, 1).normalize();
      const craterAngularRadius = Math.max(0.045, Math.min(0.24, craterRadiusUnits / EARTH_RADIUS));

      const eAttr = earthGeo.attributes.position as THREE.BufferAttribute;
      const eArr = eAttr.array as Float32Array;
      const v = new THREE.Vector3();

      if (excavateStrength <= 0.001 && seismicWavePhase <= 0.001) {
        eArr.set(baseEarthPos);
        eAttr.needsUpdate = true;
        earthGeo.computeVertexNormals();

        const cAttr = cloudGeo.attributes.position as THREE.BufferAttribute;
        (cAttr.array as Float32Array).set(baseCloudPos);
        cAttr.needsUpdate = true;
        return;
      }

      const isAirburst = regime === 'airburst';
      const isSimple = regime === 'simple_crater';
      const isOcean = regime === 'ocean_tsunami';
      const isExtinction = regime === 'crust_melt_extinction';

      if (isAirburst) {
        // Airburst leaves the ground surface 100% un-excavated (zero ground crater!),
        // while parting a subtle circular acoustic shockwave ring in the upper cloud deck (Reference Image 1 & 3).
        eArr.set(baseEarthPos);
        eAttr.needsUpdate = true;
        earthGeo.computeVertexNormals();

        const cAttr = cloudGeo.attributes.position as THREE.BufferAttribute;
        const cArr = cAttr.array as Float32Array;
        const cloudShockAngle = craterAngularRadius * 1.85;
        for (let i = 0; i < cAttr.count; i++) {
          const ix = i * 3;
          v.set(baseCloudPos[ix], baseCloudPos[ix + 1], baseCloudPos[ix + 2]);
          const baseLen = v.length() || EARTH_RADIUS + 2.1;
          const nDir = v.clone().divideScalar(baseLen);
          const dot = Math.max(-1, Math.min(1, nDir.dot(impactDir)));
          const angDist = Math.acos(dot);

          if (angDist < cloudShockAngle && seismicWavePhase > 0.01) {
            const normC = angDist / cloudShockAngle;
            const ringWave = Math.sin(normC * Math.PI * 2.0) * (1.0 - seismicWavePhase * 0.7) * 1.4;
            const r = baseLen + ringWave;
            cArr[ix] = nDir.x * r;
            cArr[ix + 1] = nDir.y * r;
            cArr[ix + 2] = nDir.z * r;
          } else {
            cArr[ix] = baseCloudPos[ix];
            cArr[ix + 1] = baseCloudPos[ix + 1];
            cArr[ix + 2] = baseCloudPos[ix + 2];
          }
        }
        cAttr.needsUpdate = true;
        return;
      }

      const ellipticity = Math.max(1.0, Math.min(1.85, stateRef.current.activeResult?.crater_ellipticity || 1.0));
      const upRef = Math.abs(impactDir.y) < 0.99 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
      const downrangeAxis = new THREE.Vector3().crossVectors(upRef, impactDir).normalize();
      const crossrangeAxis = new THREE.Vector3().crossVectors(impactDir, downrangeAxis).normalize();

      for (let i = 0; i < eAttr.count; i++) {
        const ix = i * 3;
        v.set(baseEarthPos[ix], baseEarthPos[ix + 1], baseEarthPos[ix + 2]);
        const baseLen = v.length() || EARTH_RADIUS;
        const nDir = v.clone().divideScalar(baseLen);
        const dot = Math.max(-1, Math.min(1, nDir.dot(impactDir)));
        const rawAngDist = Math.acos(dot);

        // Project onto local tangent plane for elliptical oblique crater scaling
        const localDiff = nDir.clone().sub(impactDir.clone().multiplyScalar(dot));
        const dX = localDiff.dot(downrangeAxis) / ellipticity;
        const dY = localDiff.dot(crossrangeAxis);
        const angDist = rawAngDist < 0.35 ? Math.hypot(dX, dY) : rawAngDist;

        let radialDelta = 0;
        if (excavateStrength > 0.001) {
          // Depress underlying Earth sphere vertices deeper than the 3D crater bowl mesh
          // so the Blue Marble ocean/land never pokes through the concave 3D crater pit!
          if (angDist < craterAngularRadius * 1.08) {
            const normDist = angDist / (craterAngularRadius * 1.08);
            const depthMult = isSimple ? -6.2 : isOcean ? -3.4 : isExtinction ? -9.2 : -7.6;
            const bowlDepth = (1 - Math.pow(normDist, 2.2)) * depthMult * excavateStrength;
            radialDelta += bowlDepth;
          } else if (angDist < craterAngularRadius * 1.55) {
            const rimNorm = (angDist - craterAngularRadius * 1.08) / (craterAngularRadius * 0.47);
            const rimLift =
              Math.sin(rimNorm * Math.PI) *
              (isSimple ? 1.1 : isExtinction ? 2.2 : 1.6) *
              excavateStrength;
            radialDelta += rimLift;
          }
        }

        if (seismicWavePhase > 0.001 && seismicWavePhase < 0.999) {
          const waveReach = isExtinction ? 1.45 : 0.65;
          const waveFront = seismicWavePhase * waveReach;
          const distFromWave = Math.abs(rawAngDist - waveFront);
          if (distFromWave < 0.09) {
            const waveAmp =
              Math.cos((distFromWave / 0.09) * Math.PI * 0.5) *
              (1 - seismicWavePhase) *
              (isExtinction ? 3.2 : 1.8);
            radialDelta += Math.sin((rawAngDist - waveFront) * 85) * waveAmp;
          }
        }

        const newRadius = baseLen + radialDelta;
        eArr[ix] = nDir.x * newRadius;
        eArr[ix + 1] = nDir.y * newRadius;
        eArr[ix + 2] = nDir.z * newRadius;
      }
      eAttr.needsUpdate = true;
      earthGeo.computeVertexNormals();

      // Part the 3D Cloud Deck above surface impact craters to form a radial shockwave wall
      const cAttr = cloudGeo.attributes.position as THREE.BufferAttribute;
      const cArr = cAttr.array as Float32Array;
      const cloudHoleAngle = craterAngularRadius * 2.2;
      for (let i = 0; i < cAttr.count; i++) {
        const ix = i * 3;
        v.set(baseCloudPos[ix], baseCloudPos[ix + 1], baseCloudPos[ix + 2]);
        const baseLen = v.length() || EARTH_RADIUS + 2.1;
        const nDir = v.clone().divideScalar(baseLen);
        const dot = Math.max(-1, Math.min(1, nDir.dot(impactDir)));
        const angDist = Math.acos(dot);

        if (angDist < cloudHoleAngle && excavateStrength > 0.01) {
          const normC = angDist / cloudHoleAngle;
          const lift =
            normC < 0.65
              ? -3.5 * excavateStrength
              : Math.sin(((normC - 0.65) / 0.35) * Math.PI) * 3.2 * excavateStrength;
          const r = baseLen + lift;
          cArr[ix] = nDir.x * r;
          cArr[ix + 1] = nDir.y * r;
          cArr[ix + 2] = nDir.z * r;
        } else {
          cArr[ix] = baseCloudPos[ix];
          cArr[ix + 1] = baseCloudPos[ix + 1];
          cArr[ix + 2] = baseCloudPos[ix + 2];
        }
      }
      cAttr.needsUpdate = true;
    };

    // 4. Physically-Based Rayleigh & Cornette-Shanks Mie Scattering Atmosphere Shader
    // Accurately models wavelength-dependent Rayleigh molecular scattering (lambda^-4) + Mie aerosol forward-scattering
    // and sunset terminator optical-depth reddening.
    const atmosGeo = new THREE.SphereGeometry(EARTH_RADIUS + 5.0, 84, 84);
    const atmosMat = new THREE.ShaderMaterial({
      uniforms: {
        uSunDir: { value: sunDir },
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vWorldNormal;
        varying vec3 vViewDir;
        varying vec3 vWorldPos;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPos = worldPosition.xyz;
          vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          vViewDir = normalize(-mvPosition.xyz);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform vec3 uSunDir;
        varying vec3 vNormal;
        varying vec3 vWorldNormal;
        varying vec3 vViewDir;
        varying vec3 vWorldPos;
        void main() {
          float viewDot = max(0.0, dot(vNormal, vViewDir));
          float horizon = 1.0 - viewDot;
          float opticalDepth = exp(-max(0.0, viewDot - 0.08) * 3.6) * pow(horizon, 1.55);
          float limbCushion = smoothstep(0.16, 0.88, horizon);
          float upperStratosphere = smoothstep(0.70, 0.96, horizon) * (1.0 - smoothstep(0.96, 1.0, horizon));

          float sunDot = dot(vWorldNormal, uSunDir);
          float dayFactor = smoothstep(-0.42, 0.48, sunDot);
          float terminator = smoothstep(-0.34, 0.14, sunDot) * (1.0 - smoothstep(0.14, 0.56, sunDot));

          // Rayleigh Phase Function: P_R(mu) = 3/(16*pi) * (1 + mu^2)
          vec3 worldViewDir = normalize(cameraPosition - vWorldPos);
          float mu = dot(-worldViewDir, uSunDir);
          float rayleighPhase = 0.75 * (1.0 + mu * mu);

          // Cornette-Shanks Mie Aerosol Phase Function (g = 0.72)
          float g = 0.72;
          float g2 = g * g;
          float miePhase = (1.5 * ((1.0 - g2) / (2.0 + g2))) * ((1.0 + mu * mu) / pow(max(0.05, 1.0 + g2 - 2.0 * g * mu), 1.5));

          vec3 betaRayleighDay = vec3(0.11, 0.49, 0.99);
          vec3 horizonCyanScatter = vec3(0.46, 0.86, 1.0);
          vec3 mieSolarGlare = vec3(1.0, 0.76, 0.44);
          vec3 sunsetTerminatorRed = vec3(1.0, 0.38, 0.08);
          vec3 nightAirglow = vec3(0.05, 0.22, 0.58);

          vec3 col = mix(nightAirglow, betaRayleighDay * (0.72 + rayleighPhase * 0.28), dayFactor);
          col = mix(col, horizonCyanScatter, limbCushion * 0.76);
          col += mieSolarGlare * clamp(miePhase * 0.14, 0.0, 0.48) * limbCushion * dayFactor;
          col = mix(col, sunsetTerminatorRed, (upperStratosphere * 0.65 + terminator * limbCushion * 0.72));

          float alpha = (opticalDepth * 0.94 + limbCushion * 0.36) * mix(0.50, 1.0, dayFactor);
          gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.96));
        }
      `,
      blending: THREE.AdditiveBlending,
      side: THREE.FrontSide,
      transparent: true,
      depthWrite: false,
    });
    const atmosMesh = new THREE.Mesh(atmosGeo, atmosMat);
    scene.add(atmosMesh);

    // 5. Outer Volumetric Exosphere Halo & Mie Forward-Scattering Limb (BackSide View-Vector Limb Glow)
    const exoGeo = new THREE.SphereGeometry(EARTH_RADIUS + 15.8, 84, 84);
    const exoMat = new THREE.ShaderMaterial({
      uniforms: {
        uSunDir: { value: sunDir },
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vWorldNormal;
        varying vec3 vViewDir;
        varying vec3 vWorldPos;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPos = worldPosition.xyz;
          vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          vViewDir = normalize(-mvPosition.xyz);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform vec3 uSunDir;
        varying vec3 vNormal;
        varying vec3 vWorldNormal;
        varying vec3 vViewDir;
        varying vec3 vWorldPos;
        void main() {
          float viewDot = abs(dot(vNormal, vViewDir));
          float limb = clamp(1.0 - viewDot, 0.0, 1.0);
          float innerAtmosphere = pow(smoothstep(0.14, 0.86, limb), 1.75);
          float outerRefractionEdge = smoothstep(0.68, 0.92, limb) * (1.0 - smoothstep(0.92, 0.995, limb));

          float sunDot = dot(vWorldNormal, uSunDir);
          float sunFactor = smoothstep(-0.45, 0.52, sunDot);
          float terminator = smoothstep(-0.35, 0.15, sunDot) * (1.0 - smoothstep(0.15, 0.55, sunDot));

          vec3 worldViewDir = normalize(cameraPosition - vWorldPos);
          float mu = max(0.0, dot(-worldViewDir, uSunDir));
          float mieHalo = pow(mu, 4.0) * 0.45;

          vec3 blueGlow = mix(vec3(0.07, 0.32, 0.80), vec3(0.26, 0.78, 1.0), sunFactor);
          vec3 cyanCore = vec3(0.66, 0.93, 1.0);
          vec3 sunsetRim = vec3(0.99, 0.42, 0.10);

          vec3 col = mix(blueGlow, cyanCore, pow(innerAtmosphere, 1.55) * 0.68);
          col = mix(col, sunsetRim, (outerRefractionEdge * 0.58 + terminator * 0.48 + mieHalo * 0.35));

          float alpha = (innerAtmosphere * 0.84 + outerRefractionEdge * 0.44) * mix(0.54, 1.0, sunFactor);
          gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.92));
        }
      `,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
    });
    const exoMesh = new THREE.Mesh(exoGeo, exoMat);
    scene.add(exoMesh);

    // 6. 3D Moon
    const moonTex = texLoader.load('/textures/moon.jpg');
    moonTex.colorSpace = THREE.SRGBColorSpace;
    moonTex.anisotropy = maxAniso;

    const moonGroup = new THREE.Group();
    const moonGeo = new THREE.SphereGeometry(15.5, 48, 48);
    const moonMat = new THREE.MeshStandardMaterial({
      map: moonTex,
      bumpMap: moonTex,
      bumpScale: 1.2,
      roughness: 0.92,
      metalness: 0.05,
    });
    const moonMesh = new THREE.Mesh(moonGeo, moonMat);
    moonMesh.position.set(-285, 88, -220);
    moonGroup.add(moonMesh);
    scene.add(moonGroup);

    // 7. 3D Physical Crater Group + Target Crosshair Pin
    const craterGroup = new THREE.Group();
    craterGroup.visible = false;
    earthGroup.add(craterGroup);

    const markerGroup = new THREE.Group();
    const targetRingOuter = new THREE.Mesh(
      new THREE.RingGeometry(2.2, 2.8, 32),
      new THREE.MeshBasicMaterial({
        color: 0xff6b00,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.9,
      })
    );
    const targetRingInner = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.9, 24),
      new THREE.MeshBasicMaterial({
        color: 0xfff7ed,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.95,
      })
    );
    const spikeGeo = new THREE.CylinderGeometry(0.08, 0.32, 14, 8);
    spikeGeo.rotateX(Math.PI / 2);
    const spikeMat = new THREE.MeshBasicMaterial({
      color: 0xff6b00,
      transparent: true,
      opacity: 0.85,
    });
    const spike = new THREE.Mesh(spikeGeo, spikeMat);
    spike.position.z = 7;
    markerGroup.add(targetRingOuter, targetRingInner, spike);
    earthGroup.add(markerGroup);

    // Live 3D Mouse Hover Target Reticle on the Globe Surface
    const hoverReticleGroup = new THREE.Group();
    hoverReticleGroup.visible = false;
    const hoverRingOuter = new THREE.Mesh(
      new THREE.RingGeometry(2.6, 3.2, 32),
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.9,
      })
    );
    const hoverRingInner = new THREE.Mesh(
      new THREE.RingGeometry(0.6, 1.1, 24),
      new THREE.MeshBasicMaterial({
        color: 0xff6b00,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.95,
      })
    );
    hoverReticleGroup.add(hoverRingOuter, hoverRingInner);
    earthGroup.add(hoverReticleGroup);

    // 8. 3D Geodesic Concentric Blast Rings
    const ringsGroup = new THREE.Group();
    ringsGroup.visible = false;
    earthGroup.add(ringsGroup);

    const trajectoryPulsesGroup = new THREE.Group();
    earthGroup.add(trajectoryPulsesGroup);

    const fireballGeo = new THREE.IcosahedronGeometry(1.1, 2);
    const fireballMat = new THREE.MeshBasicMaterial({
      color: 0xffaa33,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const fireballMesh = new THREE.Mesh(fireballGeo, fireballMat);
    earthGroup.add(fireballMesh);

    // ============================================================================
    // ISS / ORBITAL PERSPECTIVE 4-PHASE HYPERVELOCITY IMPACT SHADERS & GEOMETRIES
    // ============================================================================

    // PHASE 1A (0 to 2 Seconds): Atmospheric Vacuum Tube ("punches a vacuum tube through the atmosphere")
    const vacuumTubeGeo = new THREE.CylinderGeometry(0.45, 1.35, 1.0, 24, 1, true);
    vacuumTubeGeo.translate(0, 0.5, 0);
    vacuumTubeGeo.rotateX(Math.PI * 0.5); // +Z axis points along incoming trajectory vector
    const vacuumTubeMat = new THREE.ShaderMaterial({
      uniforms: {
        uOpacity: { value: 0.0 },
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
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vViewDir;
        void main() {
          if (uOpacity <= 0.005) discard;
          float fresnel = pow(1.0 - abs(dot(vNormal, vViewDir)), 1.6);
          float axialFade = smoothstep(0.0, 0.12, vUv.y) * (1.0 - smoothstep(0.65, 1.0, vUv.y));
          // Evacuated blue-white ionized air wall surrounding a dark rarefied vacuum core
          vec3 coreCol = vec3(0.85, 0.96, 1.0);
          vec3 wallCol = vec3(0.38, 0.82, 1.0);
          vec3 col = mix(coreCol, wallCol, fresnel);
          float alpha = (0.35 + fresnel * 0.65) * axialFade * uOpacity;
          gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.95));
        }
      `,
      transparent: true,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const vacuumTubeMesh = new THREE.Mesh(vacuumTubeGeo, vacuumTubeMat);
    vacuumTubeMesh.visible = false;
    earthGroup.add(vacuumTubeMesh);

    // PHASE 1B (0 to 2 Seconds): Silent, Blinding Flash of White & Blue Light ("momentarily outshines the sun")
    const blindingFlashMat = new THREE.SpriteMaterial({
      map: createBlindingImpactFlashTexture(),
      color: 0xffffff,
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    });
    const blindingFlashSprite = new THREE.Sprite(blindingFlashMat);
    blindingFlashSprite.visible = false;
    earthGroup.add(blindingFlashSprite);

    // PHASE 2A (2 to 10 Seconds): Growing, Glowing Dome-Shaped Bubble of Superheated Rock Vapor (> 6,000 K)
    const vaporBubbleGeo = new THREE.SphereGeometry(1, 64, 40, 0, Math.PI * 2, 0, Math.PI * 0.62);
    vaporBubbleGeo.rotateX(Math.PI * 0.5); // Hemisphere dome oriented along +Z surface normal
    const vaporBubbleMat = new THREE.ShaderMaterial({
      uniforms: {
        uPhase: { value: 0.0 },
        uTime: { value: 0.0 },
      },
      vertexShader: `
        uniform float uPhase;
        uniform float uTime;
        varying vec3 vNormal;
        varying vec3 vViewDir;
        varying vec3 vLocalPos;
        void main() {
          // Turbulent convective rock-vapor billowing
          float billow = sin(position.x * 9.0 + uTime * 4.5) * cos(position.y * 9.0 - uTime * 3.8) * sin(position.z * 7.0 + uTime * 5.2);
          vec3 displaced = position + normal * (billow * 0.055 * smoothstep(0.0, 0.4, uPhase));
          vLocalPos = displaced;
          vNormal = normalize(normalMatrix * normal);
          vec4 mvPos = modelViewMatrix * vec4(displaced, 1.0);
          vViewDir = normalize(-mvPos.xyz);
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: `
        uniform float uPhase;
        uniform float uTime;
        varying vec3 vNormal;
        varying vec3 vViewDir;
        varying vec3 vLocalPos;
        void main() {
          if (uPhase <= 0.001 || uPhase >= 0.995) discard;
          float ndotv = max(0.0, abs(dot(vNormal, vViewDir)));
          float rim = 1.0 - ndotv;
          float turbulence = 0.5 + 0.5 * sin(vLocalPos.x * 14.0 + uTime * 5.0) * cos(vLocalPos.y * 14.0 - uTime * 4.2);

          // Temperatures hotter than the surface of the sun (>6000K):
          // Blinding blue-white -> brilliant solar white-yellow -> incandescent orange-gold -> dark cooling silicate vapor
          vec3 blueWhite = vec3(0.92, 0.98, 1.0);
          vec3 solarYellow = vec3(1.0, 0.95, 0.72);
          vec3 magmaOrange = vec3(1.0, 0.46, 0.08);
          vec3 darkSilicate = vec3(0.26, 0.09, 0.04);

          float coolFactor = clamp(uPhase * 1.15, 0.0, 1.0);
          vec3 hotCore = mix(blueWhite, solarYellow, smoothstep(0.0, 0.28, coolFactor));
          vec3 midGlow = mix(solarYellow, magmaOrange, smoothstep(0.15, 0.68, coolFactor));
          vec3 outerCrust = mix(magmaOrange, darkSilicate, smoothstep(0.45, 0.95, coolFactor));

          vec3 col = mix(hotCore, midGlow, clamp(rim * 0.85 + turbulence * 0.25, 0.0, 1.0));
          col = mix(col, outerCrust, smoothstep(0.52, 0.95, coolFactor) * (0.4 + 0.6 * turbulence));

          float fadeOut = 1.0 - smoothstep(0.62, 1.0, uPhase);
          float alpha = clamp((0.68 + rim * 0.32) * fadeOut, 0.0, 0.96);
          gl_FragColor = vec4(col, alpha);
        }
      `,
      transparent: true,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const vaporBubbleMesh = new THREE.Mesh(vaporBubbleGeo, vaporBubbleMat);
    vaporBubbleMesh.visible = false;
    earthGroup.add(vaporBubbleMesh);

    // PHASE 2B (2 to 10 Seconds): Hyper-Velocity Exospheric Jet ("jet of molten droplets blasted straight up, piercing completely through the atmosphere and into space")
    const exosphericJetGeo = new THREE.ConeGeometry(1.0, 1.0, 32, 16, true);
    exosphericJetGeo.translate(0, 0.5, 0);
    exosphericJetGeo.rotateX(Math.PI * 0.5); // +Z points straight up along the surface normal into space
    const exosphericJetMat = new THREE.ShaderMaterial({
      uniforms: {
        uPhase: { value: 0.0 },
        uTime: { value: 0.0 },
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
        uniform float uPhase;
        uniform float uTime;
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vViewDir;
        void main() {
          if (uPhase <= 0.001 || uPhase >= 0.995) discard;
          float heightFrac = vUv.y;
          if (heightFrac > clamp(uPhase * 1.45, 0.05, 1.0)) discard;

          float core = pow(max(0.0, abs(dot(vNormal, vViewDir))), 0.75);
          // Upward-shooting molten droplet streaks
          float droplets = 0.55 + 0.45 * sin(heightFrac * 38.0 - uTime * 22.0 + vUv.x * 18.84);
          vec3 baseWhite = vec3(1.0, 0.97, 0.86);
          vec3 midGold = vec3(1.0, 0.58, 0.14);
          vec3 tipCrimson = vec3(0.92, 0.24, 0.05);

          vec3 col = mix(baseWhite, midGold, smoothstep(0.0, 0.55, heightFrac));
          col = mix(col, tipCrimson, smoothstep(0.55, 1.0, heightFrac));

          float verticalFade = (1.0 - smoothstep(0.72, 1.0, heightFrac)) * smoothstep(0.0, 0.08, heightFrac);
          float timeFade = 1.0 - smoothstep(0.55, 1.0, uPhase);
          float alpha = core * droplets * verticalFade * timeFade * 0.92;
          gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.95));
        }
      `,
      transparent: true,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const exosphericJetMesh = new THREE.Mesh(exosphericJetGeo, exosphericJetMat);
    exosphericJetMesh.visible = false;
    earthGroup.add(exosphericJetMesh);

    // PHASE 3 (10 to 60 Seconds): Circular, Expanding Ring of Compressed Air & Pulverized Dust (Shockwave)
    const shockDomeGeo = new THREE.SphereGeometry(1, 64, 32, 0, Math.PI * 2, 0, Math.PI * 0.5);
    shockDomeGeo.rotateX(Math.PI * 0.5);
    const shockDomeMat = new THREE.ShaderMaterial({
      uniforms: {
        uProgress: { value: 1.0 },
        uIsAirburst: { value: 0.0 },
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vViewDir;
        varying vec3 vLocalPos;
        void main() {
          vLocalPos = position;
          vNormal = normalize(normalMatrix * normal);
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          vViewDir = normalize(-mvPos.xyz);
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: `
        uniform float uProgress;
        uniform float uIsAirburst;
        varying vec3 vNormal;
        varying vec3 vViewDir;
        varying vec3 vLocalPos;
        void main() {
          if (uProgress >= 0.995 || uProgress <= 0.001) discard;
          float radialRim = clamp(length(vLocalPos.xy), 0.0, 1.0);
          float viewGrazing = 1.0 - abs(dot(vNormal, vViewDir));

          // Razor-sharp circular ring of compressed white air at the leading edge + trailing pulverized dust wall
          float compressedAirFront = exp(-pow((radialRim - 0.95) / 0.038, 2.0));
          float dustShockWall = exp(-pow((radialRim - 0.84) / 0.075, 2.0)) * 0.78;
          float secondaryWave = exp(-pow((radialRim - 0.68) / 0.045, 2.0)) * 0.45;
          float pressureRipples = max(0.0, sin((radialRim - uProgress * 1.5) * 46.0)) * smoothstep(0.5, 0.94, radialRim) * 0.25;

          float envelope = (1.0 - pow(uProgress, 0.72));
          float alpha = (compressedAirFront * 0.95 + dustShockWall + secondaryWave + pressureRipples + pow(viewGrazing, 3.0) * 0.22) * envelope;

          vec3 airburstCol = mix(vec3(0.55, 0.88, 1.0), vec3(0.97, 0.99, 1.0), compressedAirFront);
          vec3 dustCol = vec3(0.86, 0.68, 0.48);
          vec3 shockWhite = vec3(0.98, 0.97, 0.95);
          vec3 groundCol = mix(dustCol, shockWhite, compressedAirFront);
          vec3 col = mix(groundCol, airburstCol, uIsAirburst);

          gl_FragColor = vec4(col, clamp(alpha * 0.86, 0.0, 0.92));
        }
      `,
      transparent: true,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const shockDomeMesh = new THREE.Mesh(shockDomeGeo, shockDomeMat);
    earthGroup.add(shockDomeMesh);

    // PHASE 4A (1 to 5 Minutes): Colossal Cone-Shaped Ejecta Curtain ("cone-shaped wall of displaced rock and debris rises miles into the sky around the crater")
    const ejectaCurtainGeo = new THREE.CylinderGeometry(1.55, 1.0, 1.0, 64, 20, true);
    ejectaCurtainGeo.translate(0, 0.5, 0);
    ejectaCurtainGeo.rotateX(Math.PI * 0.5); // +Z rises along surface normal
    const ejectaCurtainMat = new THREE.ShaderMaterial({
      uniforms: {
        uPhase: { value: 0.0 },
        uTime: { value: 0.0 },
        uIsOcean: { value: 0.0 },
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vNormal;
        void main() {
          vUv = uv;
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uPhase;
        uniform float uTime;
        uniform float uIsOcean;
        varying vec2 vUv;
        varying vec3 vNormal;
        void main() {
          if (uPhase <= 0.001) discard;
          float h = vUv.y;
          float activeHeight = clamp(uPhase * 1.25, 0.05, 1.0);
          if (h > activeHeight) discard;

          // Striated ballistic debris wall texture
          float striations = 0.65 + 0.35 * sin(vUv.x * 62.83 + sin(h * 12.0)) * cos(h * 22.0 - uTime * 2.5);
          // Incandescent base near the molten crater rim transitioning to a dark silicate/ash debris wall aloft
          vec3 baseGlow = mix(vec3(0.95, 0.38, 0.07), vec3(0.55, 0.85, 0.98), uIsOcean);
          vec3 darkDebrisWall = mix(vec3(0.19, 0.15, 0.12), vec3(0.78, 0.90, 0.98), uIsOcean);
          vec3 col = mix(baseGlow, darkDebrisWall, smoothstep(0.0, 0.38, h)) * striations;

          float topFeather = 1.0 - smoothstep(activeHeight * 0.72, activeHeight, h);
          float settleFade = 1.0 - smoothstep(0.82, 1.0, uPhase) * 0.35;
          float alpha = clamp(0.84 * topFeather * settleFade, 0.0, 0.88);
          gl_FragColor = vec4(col, alpha);
        }
      `,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ejectaCurtainMesh = new THREE.Mesh(ejectaCurtainGeo, ejectaCurtainMat);
    ejectaCurtainMesh.visible = false;
    earthGroup.add(ejectaCurtainMesh);

    // PHASE 4B (1 to 5 Minutes): Dark Expanding Orbital Shadow Ring ("From space, it looks like a dark, expanding ring growing outward from the impact site, casting a massive shadow over the earth below")
    const ejectaShadowRingGeo = new THREE.RingGeometry(0.45, 1.45, 64, 2);
    const ejectaShadowRingMat = new THREE.ShaderMaterial({
      uniforms: {
        uOpacity: { value: 0.0 },
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vPos;
        void main() {
          vUv = uv;
          vPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uOpacity;
        varying vec3 vPos;
        void main() {
          if (uOpacity <= 0.005) discard;
          float r = length(vPos.xy);
          // Smooth annular dark shadow cast onto the cloud deck and crust below the conical ejecta curtain
          float ringProfile = smoothstep(0.45, 0.72, r) * (1.0 - smoothstep(1.08, 1.45, r));
          gl_FragColor = vec4(vec3(0.02, 0.015, 0.01), clamp(ringProfile * uOpacity * 0.82, 0.0, 0.85));
        }
      `,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ejectaShadowRingMesh = new THREE.Mesh(ejectaShadowRingGeo, ejectaShadowRingMat);
    ejectaShadowRingMesh.visible = false;
    earthGroup.add(ejectaShadowRingMesh);

    // PHASE 4C (Within Minutes): Persistent Glowing Molten Scar ("Within minutes, the immediate area becomes a glowing, molten scar")
    const moltenScarGeo = new THREE.CircleGeometry(1.0, 64);
    const moltenScarMat = new THREE.ShaderMaterial({
      uniforms: {
        uIntensity: { value: 0.0 },
        uTime: { value: 0.0 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv * 2.0 - 1.0;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uIntensity;
        uniform float uTime;
        varying vec2 vUv;
        void main() {
          if (uIntensity <= 0.005) discard;
          float r = length(vUv);
          if (r > 1.0) discard;
          float angle = atan(vUv.y, vUv.x);

          // Concentric impact melt lake + radial fracture magma veins
          float veins = pow(0.5 + 0.5 * sin(angle * 11.0 + r * 9.0 - uTime * 1.2) * cos(angle * 7.0 - r * 14.0), 2.0);
          float meltPool = exp(-pow(r / 0.48, 2.0));
          float rimRing = exp(-pow((r - 0.76) / 0.11, 2.0)) * 0.85;

          vec3 whiteGold = vec3(1.0, 0.94, 0.68);
          vec3 magmaOrange = vec3(1.0, 0.38, 0.04);
          vec3 crustRed = vec3(0.55, 0.08, 0.02);

          float heat = clamp(meltPool * 0.95 + rimRing * 0.75 + veins * (1.0 - r) * 0.65, 0.0, 1.0);
          vec3 col = mix(crustRed, magmaOrange, smoothstep(0.15, 0.55, heat));
          col = mix(col, whiteGold, smoothstep(0.62, 0.95, heat));

          float edgeFade = 1.0 - smoothstep(0.78, 1.0, r);
          gl_FragColor = vec4(col, clamp(heat * edgeFade * uIntensity * 0.94, 0.0, 0.95));
        }
      `,
      transparent: true,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const moltenScarMesh = new THREE.Mesh(moltenScarGeo, moltenScarMat);
    moltenScarMesh.visible = false;
    earthGroup.add(moltenScarMesh);

    // PHASE 4D: Size/Speed/Composition-Dependent Sub-Orbital Ejecta Re-Entry Firestorm Envelope
    // ("debris blasted into space begins its journey to fall back down and ignite the global atmosphere")
    const firestormEnvelopeGeo = new THREE.SphereGeometry(EARTH_RADIUS + 1.55, 96, 64);
    const firestormEnvelopeMat = new THREE.ShaderMaterial({
      uniforms: {
        uImpactDir: { value: new THREE.Vector3(0, 1, 0) },
        uProgress: { value: 0.0 },
        uMaxCoverageCos: { value: 0.85 }, // cos(maxAngularRadius): -1.0 = 100% Global Planet Killer Firestorm!
        uIntensity: { value: 0.0 },
        uTime: { value: 0.0 },
      },
      vertexShader: `
        varying vec3 vUnitPos;
        varying vec3 vNormal;
        varying vec3 vViewDir;
        void main() {
          vUnitPos = normalize(position);
          vNormal = normalize(normalMatrix * normal);
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          vViewDir = normalize(-mvPos.xyz);
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: `
        uniform vec3 uImpactDir;
        uniform float uProgress;
        uniform float uMaxCoverageCos;
        uniform float uIntensity;
        uniform float uTime;
        varying vec3 vUnitPos;
        varying vec3 vNormal;
        varying vec3 vViewDir;

        void main() {
          if (uIntensity <= 0.005 || uProgress <= 0.005) discard;
          // Angular distance from impact site on the unit sphere (0 at impact site -> PI at antipode)
          float cosAngle = clamp(dot(normalize(vUnitPos), normalize(uImpactDir)), -1.0, 1.0);
          float angularDist = acos(cosAngle); // [0, PI]

          float maxAngle = acos(clamp(uMaxCoverageCos, -1.0, 0.999));
          float currentFrontAngle = maxAngle * clamp(uProgress, 0.0, 1.0);

          if (angularDist > currentFrontAngle + 0.08) discard;

          // Leading incandescent re-entry firefront + turbulent atmospheric firestorm cellular network behind it
          float frontEdge = exp(-pow((angularDist - currentFrontAngle) / 0.075, 2.0));
          float interiorMask = 1.0 - smoothstep(currentFrontAngle - 0.06, currentFrontAngle + 0.05, angularDist);

          float n1 = sin(vUnitPos.x * 24.0 + uTime * 1.6) * cos(vUnitPos.y * 24.0 - uTime * 1.3) * sin(vUnitPos.z * 24.0 + uTime * 1.1);
          float n2 = sin(vUnitPos.x * 52.0 - uTime * 2.6) * cos(vUnitPos.z * 52.0 + uTime * 2.2);
          float n3 = sin(vUnitPos.y * 76.0 + uTime * 3.8) * cos(vUnitPos.x * 76.0 - uTime * 3.1);
          float fireCells = clamp(0.50 + 0.50 * (n1 * 0.55 + n2 * 0.30 + n3 * 0.15), 0.0, 1.0);

          // Subtle thermodynamic heat pulse
          float heatPulse = 0.94 + 0.06 * sin(uTime * 4.2 + angularDist * 16.0);

          // Grazing atmospheric limb glow (volumetric burning corona into space)
          float limbGlow = pow(1.0 - abs(dot(vNormal, vViewDir)), 2.2);

          vec3 emberDark = vec3(0.55, 0.08, 0.01);
          vec3 flameOrange = vec3(1.0, 0.38, 0.04);
          vec3 coronaGold = vec3(1.0, 0.82, 0.35);
          vec3 incandescence = vec3(1.0, 0.96, 0.78);

          vec3 interiorCol = mix(emberDark, flameOrange, smoothstep(0.20, 0.80, fireCells));
          vec3 col = mix(interiorCol, coronaGold, frontEdge * 0.75 + limbGlow * 0.45);
          col += incandescence * (frontEdge * 0.45 * heatPulse);

          // Ground Zero Smoke & Ash Obscuration:
          // Pulverized ejecta soot and towering pyrocumulonimbus plumes rise over the crater bowl,
          // naturally blending the crater underneath dense smoke rather than harsh contrast.
          float craterProximity = 1.0 - smoothstep(0.0, 0.16, angularDist);
          vec3 sootAshCol = vec3(0.08, 0.06, 0.05);
          col = mix(col, sootAshCol, craterProximity * 0.58 * uIntensity);

          float alpha = (interiorMask * (0.28 + 0.48 * pow(fireCells, 1.3) + limbGlow * 0.38) + frontEdge * 0.82) * uIntensity * heatPulse;
          gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.92));
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const firestormEnvelopeMesh = new THREE.Mesh(firestormEnvelopeGeo, firestormEnvelopeMat);
    firestormEnvelopeMesh.visible = false;
    earthGroup.add(firestormEnvelopeMesh);

    const plumeGroup = new THREE.Group();
    plumeGroup.visible = false;
    earthGroup.add(plumeGroup);

    // 9. PBR Asteroid Textures + 150 Ballistic Ejecta Boulders
    const {
      albedoTex: astAlbedo,
      bumpTex: astBump,
      emissiveTex: astEmissive,
    } = createAsteroidPBRTextures(maxAniso);

    const ejectaCount = 150;
    const ejectaBoulderGeo = new THREE.DodecahedronGeometry(0.68, 0);
    const ejectaBoulderMat = new THREE.MeshStandardMaterial({
      color: 0x574c43,
      map: astAlbedo,
      bumpMap: astBump,
      bumpScale: 1.2,
      emissive: new THREE.Color(0xff4500),
      emissiveIntensity: 1.8,
      roughness: 0.85,
      metalness: 0.2,
      flatShading: true,
    });
    const ejectaInstanced = new THREE.InstancedMesh(
      ejectaBoulderGeo,
      ejectaBoulderMat,
      ejectaCount
    );
    ejectaInstanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    ejectaInstanced.visible = false;
    earthGroup.add(ejectaInstanced);

    const ejectaData: EjectaBoulderData[] = [];
    for (let i = 0; i < ejectaCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const elev = 0.28 + Math.random() * 0.95;
      const vx = Math.cos(theta) * Math.cos(elev);
      const vy = Math.sin(theta) * Math.cos(elev);
      const vz = Math.sin(elev);
      ejectaData.push({
        velDir: new THREE.Vector3(vx, vy, vz).normalize(),
        speed: 18 + Math.random() * 44,
        rotSpeed: new THREE.Vector3(
          (Math.random() - 0.5) * 8,
          (Math.random() - 0.5) * 8,
          (Math.random() - 0.5) * 8
        ),
        scale: 0.35 + Math.pow(Math.random(), 2) * 1.55,
      });
    }

    // 10. Scientifically Calibrated 3D Asteroid Rig (Main Planetary Scene - Zero atmospheric cone!)
    const asteroidAnchorGroup = new THREE.Group();
    scene.add(asteroidAnchorGroup);

    const initSpec = getAsteroidMorphologySpec(
      selectedNeoId,
      activeResult.composition,
      activeResult.diameter_m
    );
    const asteroidRig = buildScientificAsteroidRig(
      initSpec,
      activeResult.diameter_m,
      astAlbedo,
      astBump,
      astEmissive
    );
    asteroidRig.bowShockMesh.visible = false;
    asteroidRig.plasmaWakeInner.visible = false;
    asteroidRig.plasmaWakeOuter.visible = false;
    asteroidRig.entryCorridorGroup.visible = false;
    asteroidAnchorGroup.add(asteroidRig.rootGroup);

    // 11. 3D NASA DART Kinetic Impactor Spacecraft (Zero forward cone!)
    const dartProbeGroup = new THREE.Group();
    const busMat = new THREE.MeshStandardMaterial({
      color: 0xd97706,
      metalness: 0.88,
      roughness: 0.22,
      flatShading: true,
    });
    const panelMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      metalness: 0.75,
      roughness: 0.25,
      emissive: 0x0284c7,
      emissiveIntensity: 0.35,
    });
    const busMesh = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 1.8), busMat);
    const leftWing = new THREE.Mesh(new THREE.BoxGeometry(6.5, 0.08, 1.5), panelMat);
    leftWing.position.x = -4.1;
    const rightWing = new THREE.Mesh(new THREE.BoxGeometry(6.5, 0.08, 1.5), panelMat);
    rightWing.position.x = 4.1;
    dartProbeGroup.add(busMesh, leftWing, rightWing);
    scene.add(dartProbeGroup);

    // 8 animated directional energy pulse markers along the orbital trajectory
    for (let i = 0; i < 8; i++) {
      const pulseMarker = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.65, 0),
        new THREE.MeshBasicMaterial({
          color: 0xffedd5,
          transparent: true,
          opacity: 0.8,
        })
      );
      trajectoryPulsesGroup.add(pulseMarker);
    }

    sceneObjectsRef.current = {
      scene,
      earthGroup,
      earthMesh,
      earthGeo,
      baseEarthPos,
      cloudMesh,
      cloudGeo,
      baseCloudPos,
      dustVeilMesh,
      markerGroup,
      hoverReticleGroup,
      craterGroup,
      ringsGroup,
      trajectoryPulsesGroup,
      asteroidAnchorGroup,
      asteroidRig,
      dartProbeGroup,
      explosionLight,
      fireballMesh,
      shockDomeMesh,
      plumeGroup,
      vacuumTubeMesh,
      blindingFlashSprite,
      vaporBubbleMesh,
      exosphericJetMesh,
      ejectaCurtainMesh,
      ejectaShadowRingMesh,
      moltenScarMesh,
      firestormEnvelopeMesh,
      ejectaInstanced,
      ejectaData,
      astAlbedo,
      astBump,
      astEmissive,
      controls,
      camera,
      entryCamera,
      isSplitActiveRef: false,
      deformEarthAndCloudsForCrater,
      cameraTransition: {
        active: false,
        startPos: new THREE.Vector3(),
        endPos: new THREE.Vector3(),
        startTarget: new THREE.Vector3(),
        endTarget: new THREE.Vector3(),
        progress: 1,
      },
    };

    // High-performance analytical sphere intersection for instant 60fps coordinate picking
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const analyticalEarthSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), EARTH_RADIUS);
    const rayHitPoint = new THREE.Vector3();
    let pointerDownPos = { x: 0, y: 0 };

    const getEarthIntersection = (e: MouseEvent): THREE.Vector3 | null => {
      const rect = renderer.domElement.getBoundingClientRect();
      const localX = e.clientX - rect.left;
      const localY = e.clientY - rect.top;

      // Ignore clicks/hovers if pointer is inside the floating Top-Right PiP window
      if (sceneObjectsRef.current.isSplitActiveRef && pipViewportRef.current) {
        const pipRect = pipViewportRef.current.getBoundingClientRect();
        if (
          e.clientX >= pipRect.left - 8 &&
          e.clientX <= pipRect.right + 8 &&
          e.clientY >= pipRect.top - 40 &&
          e.clientY <= pipRect.bottom + 8
        ) {
          return null;
        }
      }

      mouse.x = (localX / Math.max(1, rect.width)) * 2 - 1;
      mouse.y = -(localY / Math.max(1, rect.height)) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      return raycaster.ray.intersectSphere(analyticalEarthSphere, rayHitPoint);
    };

    const handlePointerDown = (e: MouseEvent) => {
      pointerDownPos = { x: e.clientX, y: e.clientY };
    };

    const handlePointerMove = (e: MouseEvent) => {
      const hit = getEarthIntersection(e);
      if (hit) {
        const { lat, lon } = vector3ToLatLon(hit);
        if (hoverTooltipRef.current && hoverCoordsTextRef.current) {
          hoverTooltipRef.current.style.opacity = '1';
          const clampedX = Math.min(window.innerWidth - 290, Math.max(12, e.clientX + 16));
          const clampedY = Math.min(window.innerHeight - 60, Math.max(54, e.clientY + 14));
          hoverTooltipRef.current.style.transform = `translate3d(${clampedX}px, ${clampedY}px, 0)`;
          const latHemi = lat >= 0 ? 'N' : 'S';
          const lonHemi = lon >= 0 ? 'E' : 'W';
          hoverCoordsTextRef.current.textContent = `${Math.abs(lat).toFixed(2)}° ${latHemi}, ${Math.abs(lon).toFixed(2)}° ${lonHemi}`;
          const isOcean = isOceanCoordinate(lat, lon);
          const elevM = estimateTerrainElevationM(lat, lon, isOcean);
          if (hoverElevationTextRef.current) {
            hoverElevationTextRef.current.textContent = `${elevM >= 0 ? '+' : ''}${elevM.toLocaleString()}m`;
          }
          if (hoverSurfaceTextRef.current) {
            hoverSurfaceTextRef.current.textContent = isOcean ? 'OCEAN' : 'LAND';
            hoverSurfaceTextRef.current.className = isOcean
              ? 'text-[#38BDF8] font-bold uppercase text-[10px]'
              : 'text-[#FDBA74] font-bold uppercase text-[10px]';
          }
        }
        const surfacePos = hit.clone().normalize().multiplyScalar(EARTH_RADIUS + 2.2);
        hoverReticleGroup.position.copy(surfacePos);
        hoverReticleGroup.lookAt(surfacePos.clone().multiplyScalar(2));
        hoverReticleGroup.visible = true;
      } else {
        if (hoverTooltipRef.current) {
          hoverTooltipRef.current.style.opacity = '0';
        }
        hoverReticleGroup.visible = false;
      }
    };

    const handlePointerLeave = () => {
      if (hoverTooltipRef.current) {
        hoverTooltipRef.current.style.opacity = '0';
      }
      hoverReticleGroup.visible = false;
    };

    const handlePointerUp = (e: MouseEvent) => {
      const dx = e.clientX - pointerDownPos.x;
      const dy = e.clientY - pointerDownPos.y;
      if (Math.hypot(dx, dy) > 6) return;

      const hit = getEarthIntersection(e);
      if (hit) {
        const { lat, lon } = vector3ToLatLon(hit);
        stateRef.current.onSelectLocation(lat, lon);
      }
    };

    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    renderer.domElement.addEventListener('pointermove', handlePointerMove);
    renderer.domElement.addEventListener('pointerleave', handlePointerLeave);
    renderer.domElement.addEventListener('pointerup', handlePointerUp);

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    let animationFrameId: number;
    const startTime = performance.now();
    let lastFrameTime = startTime;
    let lastHudSyncTime = 0;
    const APPROACH_DURATION_SEC = 5.5;
    const BLAST_DURATION_SEC = 6.5;
    const IMPACT_SPLIT = 0.55;

    const dummyMatrix = new THREE.Matrix4();
    const dummyPos = new THREE.Vector3();
    const dummyQuat = new THREE.Quaternion();
    const dummyEuler = new THREE.Euler();
    const dummyScale = new THREE.Vector3();
    const worldUp = new THREE.Vector3(0, 1, 0);

    let frameTimerId = 0;
    const animate = () => {
      const now = performance.now();
      const rawDt = now - lastFrameTime;
      const dt = Math.min(0.1, Math.max(0.001, rawDt * 0.001));
      lastFrameTime = now;
      const elapsed = (now - startTime) * 0.001;

      cloudMesh.rotation.y = elapsed * 0.01;
      cloudShadowMesh.rotation.y = elapsed * 0.01 + 0.008;
      stars.rotation.y = elapsed * 0.0016;

      const pinPulse = 1 + Math.sin(elapsed * 4.5) * 0.18;
      targetRingOuter.scale.set(pinPulse, pinPulse, 1);

      const camTrans = sceneObjectsRef.current.cameraTransition;
      if (camTrans && camTrans.active) {
        camTrans.progress = Math.min(1, camTrans.progress + dt * 0.65);
        const ease = 1 - Math.pow(1 - camTrans.progress, 3);
        camera.position.lerpVectors(camTrans.startPos, camTrans.endPos, ease);
        controls.target.lerpVectors(camTrans.startTarget, camTrans.endTarget, ease);
        if (camTrans.progress >= 1) {
          camTrans.active = false;
        }
      }

      const {
        selectedLat: lat,
        selectedLon: lon,
        activeResult: res,
        showDeflectionArc: showDeflect,
        deflectionResult: defRes,
        manualScrubProgress: scrubVal,
        splitCamMode: currentSplitMode,
        cameraPreset: currentCameraPreset,
      } = stateRef.current;

      const rig = sceneObjectsRef.current.asteroidRig;
      const angle = res?.angle_deg || 45;

      // Target surface position (or airburst altitude position if airburst regime)
      const burstHeightOffset =
        res?.impact_regime === 'airburst'
          ? Math.max(3.2, Math.min(8.5, ((res.burst_altitude_km || 28) / 35) * 6.5))
          : 0.6;
      const targetPos = latLonToVector3(lat, lon, EARTH_RADIUS + burstHeightOffset);
      const surfaceTargetPos = latLonToVector3(lat, lon, EARTH_RADIUS + 0.6);
      const normal = surfaceTargetPos.clone().normalize();
      const tangent = new THREE.Vector3(0, 1, 0).cross(normal).normalize();
      if (tangent.lengthSq() < 0.01) tangent.set(1, 0, 0);
      const bitangent = normal.clone().cross(tangent).normalize();

      const elevRad = (Math.max(15, angle || 45) * Math.PI) / 180;
      const incomingDir = normal
        .clone()
        .multiplyScalar(Math.sin(elevRad))
        .add(tangent.clone().multiplyScalar(Math.cos(elevRad)))
        .normalize();

      const startPos = targetPos.clone().add(incomingDir.clone().multiplyScalar(185));
      const controlPoint = targetPos
        .clone()
        .add(incomingDir.clone().multiplyScalar(98))
        .add(bitangent.clone().multiplyScalar(38));
      const curve = new THREE.QuadraticBezierCurve3(startPos, controlPoint, targetPos);

      trajectoryPulsesGroup.children.forEach((child, idx) => {
        const tPulse = (elapsed * 0.28 + idx / 8) % 1.0;
        const p = curve.getPoint(tPulse);
        child.position.copy(p);
        child.rotation.x = elapsed * 2.0;
        child.rotation.y = elapsed * 2.5;
      });

      const craterRadiusUnits =
        res?.impact_regime === 'crust_melt_extinction'
          ? 20.5
          : res?.impact_regime === 'simple_crater'
          ? Math.max(4.2, Math.min(7.2, Math.log10((res?.tnt_megatons || 10) + 1) * 2.4))
          : Math.max(5.8, Math.min(18, Math.log10((res?.tnt_megatons || 10) + 1) * 3.2));

      if (simAnimRef.current.active) {
        if (simAnimRef.current.progress < IMPACT_SPLIT) {
          simAnimRef.current.progress += (dt / APPROACH_DURATION_SEC) * IMPACT_SPLIT;
        } else {
          simAnimRef.current.progress += (dt / BLAST_DURATION_SEC) * (1.0 - IMPACT_SPLIT);
        }
        const prog = simAnimRef.current.progress;

        if (prog >= IMPACT_SPLIT && !simAnimRef.current.detonatedTriggered) {
          simAnimRef.current.detonatedTriggered = true;
          simAnimRef.current.hasImpacted = true;
          stateRef.current.onSimulationPhaseChange?.('detonating');
        }
        if (prog >= 1.0) {
          simAnimRef.current.active = false;
          simAnimRef.current.progress = 1.0;
          stateRef.current.onSimulationPhaseChange?.('complete');
        }
      }

      const isScrubbing = scrubVal !== null && scrubVal !== undefined;
      const effectiveSimActive = simAnimRef.current.active || isScrubbing;
      const prog = isScrubbing ? scrubVal! : simAnimRef.current.progress;

      let currentEntryState: AtmosphericEntryTelemetry;

      // Helper for firestorm angular coverage based on asteroid size, speed & megatons
      const getFirestormMaxCos = (r: ImpactSimulationResult): number => {
        if (r.firestorm_regime === 'global_firestorm_envelope') return -1.0; // 100% of planet enveloped
        if (r.firestorm_regime === 'continental_firestorm') {
          const frac = Math.min(0.68, Math.max(0.18, (r.firestorm_coverage_pct || 25) / 100));
          return 1.0 - 2.0 * frac;
        }
        if (r.firestorm_regime === 'local_thermal_ignition') {
          return Math.cos(Math.min(0.42, Math.max(0.12, craterRadiusUnits / EARTH_RADIUS * 2.1)));
        }
        return 0.999;
      };

      if (effectiveSimActive) {
        const approachPhase = Math.min(1, prog / IMPACT_SPLIT);
        const blastPhase = prog > IMPACT_SPLIT ? (prog - IMPACT_SPLIT) / (1.0 - IMPACT_SPLIT) : 0;
        currentEntryState = calculateAtmosphericEntryState(approachPhase, res);

        if (prog <= IMPACT_SPLIT) {
          // =========================================================================
          // PRE-IMPACT HYPERSONIC APPROACH (Clean Asteroid in Space — ZERO ugly atmospheric cone/plasma attachment!)
          // In the final 16% before impact (0 to 2 Seconds: The Entry), the asteroid punches a razor-sharp vacuum tube through the atmosphere.
          // =========================================================================
          asteroidAnchorGroup.visible = true;
          dartProbeGroup.visible = false;

          const easeIn = 0.04 + 0.96 * Math.pow(approachPhase, 1.35);
          const pos = curve.getPoint(easeIn);
          const nextPos = curve.getPoint(Math.min(1, easeIn + 0.015));
          asteroidAnchorGroup.position.copy(pos);
          asteroidAnchorGroup.lookAt(nextPos);

          if (rig) {
            rig.primaryMesh.rotation.x += dt * 1.15;
            rig.primaryMesh.rotation.y += dt * 1.55;
            rig.bouldersInstanced.rotation.copy(rig.primaryMesh.rotation);
            if (rig.moonletPivot) {
              rig.moonletPivot.rotation.y += dt * 1.4;
              rig.moonletPivot.rotation.z = Math.sin(elapsed * 1.2) * 0.18;
            }

            // Strictly disable all old atmospheric entry cones, wakes, and particles on the asteroid
            rig.primaryMat.emissiveIntensity = 0.0;
            rig.setThermalAblationState(0.0, elapsed);
            rig.bowShockMesh.visible = false;
            rig.plasmaWakeInner.visible = false;
            rig.plasmaWakeOuter.visible = false;
            rig.ablationParticles.visible = false;
            rig.childFragmentsGroup.visible = false;
            rig.plasmaLight.intensity = 0.0;
            rig.entryCorridorGroup.visible = false;

            const baseVisualScale = getAsteroidVisualScale(res.diameter_m);
            rig.coreGroup.scale.setScalar(baseVisualScale);
          }

          // Punch the atmospheric vacuum tube in the final moments of approach (approachPhase > 0.84)
          if (approachPhase > 0.84) {
            const tubeProg = (approachPhase - 0.84) / 0.16;
            vacuumTubeMesh.visible = true;
            vacuumTubeMesh.position.copy(surfaceTargetPos);
            vacuumTubeMesh.lookAt(surfaceTargetPos.clone().add(incomingDir));
            const tubeRadius = Math.max(0.75, Math.min(3.6, craterRadiusUnits * 0.22));
            vacuumTubeMesh.scale.set(tubeRadius, tubeRadius, 26.0);
            vacuumTubeMat.uniforms.uOpacity.value = Math.min(1.0, tubeProg * 1.25);
          } else {
            vacuumTubeMesh.visible = false;
          }

          // Dynamic camera position during approach respecting the operator's active Camera View Preset
          if (simAnimRef.current.active && !camTrans?.active) {
            if (currentCameraPreset === 'horizon') {
              // Horizon View: Remain on the surface gazing along the terrain at the incoming impact site
              const skimPos = surfaceTargetPos
                .clone()
                .multiplyScalar(1.16)
                .sub(tangent.clone().multiplyScalar(58))
                .add(bitangent.clone().multiplyScalar(22));
              const horizonLook = surfaceTargetPos.clone().multiplyScalar(0.98);
              camera.position.lerp(skimPos, Math.min(1, dt * 3.5));
              controls.target.lerp(horizonLook, Math.min(1, dt * 4.5));
            } else if (currentCameraPreset === 'asteroid') {
              // Asteroid Chase View: Follow closely behind the incoming bolide
              const camOffset = bitangent
                .clone()
                .multiplyScalar(24)
                .add(normal.clone().multiplyScalar(11))
                .add(incomingDir.clone().multiplyScalar(16));
              const asteroidChasePos = pos.clone().add(camOffset);
              camera.position.lerp(asteroidChasePos, Math.min(1, dt * 4.5));
              controls.target.lerp(pos, Math.min(1, dt * 6.0));
            } else if (currentCameraPreset === 'moon') {
              // Lunar Observatory View: Remain stationed on the Moon observing Earth
              const moonCamPos = new THREE.Vector3(-165, 130, 350);
              const earthTarget = new THREE.Vector3(-35, 15, -25);
              camera.position.lerp(moonCamPos, Math.min(1, dt * 3.0));
              controls.target.lerp(earthTarget, Math.min(1, dt * 4.0));
            } else {
              // Default Orbital View: ISS-like orbital vantage point observing the descent and impact basin
              const east = worldUp.clone().cross(normal).normalize();
              if (east.lengthSq() < 0.01) east.set(1, 0, 0);
              const north = normal.clone().cross(east).normalize();

              const chaseCamPos = pos
                .clone()
                .addScaledVector(incomingDir, 42)
                .addScaledVector(east, 52)
                .addScaledVector(north, 22);

              const issVantageRadius =
                res.firestorm_regime === 'global_firestorm_envelope' ? 235 : 196;
              const issOrbitalVantagePos = normal
                .clone()
                .multiplyScalar(issVantageRadius)
                .addScaledVector(east, 64)
                .addScaledVector(north, 24)
                .add(new THREE.Vector3(0, 14, 0));

              const blend = Math.max(0, Math.min(1, (approachPhase - 0.18) / 0.72));
              const smoothBlend = blend * blend * (3 - 2 * blend);
              const desiredCamPos = chaseCamPos.lerp(issOrbitalVantagePos, smoothBlend);
              camera.position.lerp(desiredCamPos, Math.min(1, dt * 2.8));

              const endLookTarget = targetPos
                .clone()
                .multiplyScalar(0.76)
                .add(new THREE.Vector3(0, -6, 0));
              const asteroidLookTarget = pos
                .clone()
                .lerp(targetPos.clone().multiplyScalar(0.68), 0.35);
              const desiredLook = asteroidLookTarget.lerp(endLookTarget, smoothBlend);
              controls.target.lerp(desiredLook, Math.min(1, dt * 3.4));
            }
          }

          craterGroup.visible = false;
          ringsGroup.visible = false;
          ejectaInstanced.visible = false;
          plumeGroup.visible = false;
          dustVeilMesh.visible = false;
          explosionLight.intensity = 0;
          fireballMat.opacity = 0;
          shockDomeMat.uniforms.uProgress.value = 1.0;
          blindingFlashSprite.visible = false;
          vaporBubbleMesh.visible = false;
          exosphericJetMesh.visible = false;
          ejectaCurtainMesh.visible = false;
          ejectaShadowRingMesh.visible = false;
          moltenScarMesh.visible = false;
          firestormEnvelopeMesh.visible = false;
        } else {
          // =========================================================================
          // 4-PHASE ORBITAL / ISS-PERSPECTIVE HYPERVELOCITY IMPACT SEQUENCE (prog > IMPACT_SPLIT)
          // - Phase 1 (blastPhase 0.00 - 0.14 => 0 to 2 Seconds): The Entry & Flash
          //   Vacuum tube + silent, blinding flash of white & blue light outshining the sun. Asteroid completely vaporizes alongside bedrock.
          // - Phase 2 (blastPhase 0.05 - 0.38 => 2 to 10 Seconds): The Fireball & Jet
          //   Dome-shaped expanding bubble of superheated rock vapor (>6000K) punching through the atmosphere + hyper-velocity jet of molten droplets blasted straight up into space.
          // - Phase 3 (blastPhase 0.20 - 0.68 => 10 to 60 Seconds): The Crater & Shockwave
          //   Ground behaves like liquid as bowl-shaped crater hollows out + circular expanding ring of compressed air and dust ripples outward.
          // - Phase 4 (blastPhase 0.45 - 1.00 => 1 to 5 Minutes): The Ejecta Curtain, Dark Shadow Ring, Molten Scar & Re-Entry Firestorm
          //   Colossal cone-shaped ejecta curtain + dark expanding shadow ring over Earth + glowing molten scar + size/speed-dependent atmospheric firestorm envelope.
          // =========================================================================
          asteroidAnchorGroup.visible = false; // Completely vaporizes on contact — does not bounce
          dartProbeGroup.visible = false;

          const isAirburstEvent = Boolean(res.is_airburst || res.impact_regime === 'airburst');
          const isOceanEvent = res.impact_regime === 'ocean_tsunami';

          // -------------------------------------------------------------------------
          // PHASE 1 VISUALS (0 to 2 Seconds): Atmospheric Vacuum Tube + Blinding White-Blue Flash
          // -------------------------------------------------------------------------
          if (blastPhase < 0.18) {
            vacuumTubeMesh.visible = true;
            vacuumTubeMesh.position.copy(surfaceTargetPos);
            vacuumTubeMesh.lookAt(surfaceTargetPos.clone().add(incomingDir));
            const tubeRadius = Math.max(0.85, Math.min(4.2, craterRadiusUnits * 0.25));
            vacuumTubeMesh.scale.set(tubeRadius, tubeRadius, 26.0);
            vacuumTubeMat.uniforms.uOpacity.value = Math.max(0, 1.0 - blastPhase / 0.18);
          } else {
            vacuumTubeMesh.visible = false;
          }

          if (blastPhase < 0.22) {
            blindingFlashSprite.visible = true;
            blindingFlashSprite.position.copy(
              latLonToVector3(lat, lon, EARTH_RADIUS + (isAirburstEvent ? 4.2 : 2.2))
            );
            const flashEnvelope =
              blastPhase < 0.03
                ? blastPhase / 0.03
                : Math.pow(Math.max(0, 1.0 - (blastPhase - 0.03) / 0.19), 1.85);
            const flashSize =
              Math.max(38, Math.min(135, craterRadiusUnits * 6.8)) *
              (0.65 + 0.55 * Math.sin(Math.min(1, blastPhase / 0.22) * Math.PI));
            blindingFlashSprite.scale.set(flashSize, flashSize, 1);
            blindingFlashMat.opacity = Math.min(1.0, flashEnvelope * 1.15);
          } else {
            blindingFlashSprite.visible = false;
          }

          // -------------------------------------------------------------------------
          // PHASE 2 VISUALS (2 to 10 Seconds): Growing, Glowing Rock-Vapor Bubble + Exospheric Molten Jet
          // -------------------------------------------------------------------------
          const maxBubbleScale = isAirburstEvent
            ? Math.min(6.5, Math.max(2.0, Math.log10((res?.tnt_kilotons || 5) + 1.2) * 1.35))
            : Math.min(26, Math.max(5.5, craterRadiusUnits * 1.32));

          if (blastPhase >= 0.02 && blastPhase <= 0.58) {
            const p2 = (blastPhase - 0.02) / 0.56;
            vaporBubbleMesh.visible = true;
            vaporBubbleMesh.position.copy(isAirburstEvent ? targetPos : surfaceTargetPos);
            vaporBubbleMesh.lookAt(
              (isAirburstEvent ? targetPos : surfaceTargetPos).clone().multiplyScalar(2)
            );
            const bubbleRadius = maxBubbleScale * (0.18 + 0.88 * Math.pow(p2, 0.46));
            vaporBubbleMesh.scale.set(bubbleRadius, bubbleRadius, bubbleRadius * 1.12);
            vaporBubbleMat.uniforms.uPhase.value = p2;
            vaporBubbleMat.uniforms.uTime.value = elapsed;
          } else {
            vaporBubbleMesh.visible = false;
          }

          // Hyper-velocity jet of molten droplets blasted straight up into space (non-airburst surface/ocean impacts)
          if (!isAirburstEvent && blastPhase >= 0.03 && blastPhase <= 0.54) {
            const jetProg = (blastPhase - 0.03) / 0.51;
            exosphericJetMesh.visible = true;
            exosphericJetMesh.position.copy(surfaceTargetPos);
            exosphericJetMesh.lookAt(surfaceTargetPos.clone().multiplyScalar(2));
            const jetWidth = Math.max(1.2, Math.min(5.8, craterRadiusUnits * 0.28));
            const jetHeight =
              Math.max(18, Math.min(54, craterRadiusUnits * 2.85)) * Math.pow(jetProg, 0.42);
            exosphericJetMesh.scale.set(jetWidth, jetWidth, jetHeight);
            exosphericJetMat.uniforms.uPhase.value = jetProg;
            exosphericJetMat.uniforms.uTime.value = elapsed;
          } else {
            exosphericJetMesh.visible = false;
          }

          // Inner core incandescent glow
          fireballMesh.position.copy(targetPos);
          fireballMat.color.setHex(blastPhase < 0.08 ? 0xe0f2fe : 0xffaa33);
          const curScale = 0.7 + Math.pow(blastPhase, 0.38) * (maxBubbleScale * 0.72);
          fireballMesh.scale.setScalar(curScale);
          fireballMesh.rotation.y += dt * 2.4;
          fireballMat.opacity = Math.max(
            0,
            Math.pow(Math.max(0, 1 - blastPhase * (isAirburstEvent ? 2.6 : 1.65)), 1.8) * 0.85
          );

          // Dynamic Planetary PointLight (Blue-white flash at t=0..2s transitioning to solar orange-gold vapor glow)
          explosionLight.position.copy(
            latLonToVector3(lat, lon, EARTH_RADIUS + (isAirburstEvent ? 26 : 24))
          );
          if (blastPhase < 0.12) {
            explosionLight.color.setHex(0xbae6fd);
            explosionLight.intensity = 18 + (1 - blastPhase / 0.12) * 58;
          } else {
            explosionLight.color.setHex(isAirburstEvent ? 0x7dd3fc : 0xff6b00);
            const afterglow = Math.max(0.15, 1 - (blastPhase - 0.12) / 0.88);
            explosionLight.intensity = (isAirburstEvent ? 2 : 5) + afterglow * 28;
          }

          // -------------------------------------------------------------------------
          // PHASE 3 VISUALS (10 to 60 Seconds): Liquid-Crust Crater Excavation & Circular Compressed Air/Dust Shockwave
          // -------------------------------------------------------------------------
          const craterPhase = Math.max(0, Math.min(1, (blastPhase - 0.10) / 0.45));
          const excavateEase = 1 - Math.pow(1 - craterPhase, 2.6);
          deformEarthAndCloudsForCrater(
            lat,
            lon,
            craterRadiusUnits,
            isAirburstEvent ? 0 : excavateEase,
            isAirburstEvent ? blastPhase * 0.45 : blastPhase,
            res.impact_regime
          );

          if (simAnimRef.current.active && blastPhase < 0.22) {
            const shakeScale = isAirburstEvent
              ? Math.min(0.85, Math.max(0.18, Math.log10((res.tnt_kilotons || 5) + 1) * 0.22))
              : 1.5;
            const shakeMag = (1 - blastPhase / 0.22) * shakeScale;
            camera.position.x += (Math.random() - 0.5) * shakeMag;
            camera.position.y += (Math.random() - 0.5) * shakeMag;
            camera.position.z += (Math.random() - 0.5) * shakeMag;
          }

          craterGroup.visible = blastPhase >= 0.08;
          craterGroup.scale.setScalar(1.0);
          ringsGroup.visible = !isAirburstEvent && blastPhase >= 0.16;

          if (!isAirburstEvent && ringsGroup.visible) {
            ringsGroup.children.forEach((ringChild, idx) => {
              const line = ringChild as THREE.Line;
              const mat = line.material as THREE.LineBasicMaterial;
              const ringDelay = 0.16 + idx * 0.11;
              const ringProg = Math.max(0, Math.min(1, (blastPhase - ringDelay) / 0.45));
              const easeRing = 1 - Math.pow(1 - ringProg, 2.4);
              mat.opacity = ringProg <= 0.01 ? 0 : 0.72 * easeRing;
            });
          }

          // Circular expanding ring of compressed air & dust (Shockwave)
          const shockWavePhase = Math.max(0, Math.min(1, (blastPhase - 0.08) / 0.68));
          shockDomeMesh.position.copy(isAirburstEvent ? targetPos : surfaceTargetPos);
          shockDomeMesh.lookAt(
            (isAirburstEvent ? targetPos : surfaceTargetPos).clone().multiplyScalar(2)
          );
          const domeMaxScale = isAirburstEvent
            ? Math.min(20, Math.max(6.0, Math.log10((res?.tnt_kilotons || 5) + 2) * 3.6))
            : Math.max(15, maxBubbleScale * 2.45);
          const domeScale = 1.5 + Math.pow(shockWavePhase, 0.54) * domeMaxScale;
          shockDomeMesh.scale.setScalar(domeScale);
          shockDomeMat.uniforms.uIsAirburst.value = isAirburstEvent ? 1.0 : 0.0;
          shockDomeMat.uniforms.uProgress.value = shockWavePhase <= 0.001 ? 1.0 : shockWavePhase;

          // Animate Upper-Atmosphere Refractive N-Wave Sonic Boom Shader if Airburst
          if (isAirburstEvent && craterGroup.children[0] && craterGroup.children[0].children[0]) {
            const airburstCluster = craterGroup.children[0].children[0];
            airburstCluster.children.forEach((child) => {
              if (child.userData?.isAirburstSonicWave) {
                const sMat = (child as THREE.Mesh).material as THREE.ShaderMaterial;
                if (sMat.uniforms?.uProgress) {
                  sMat.uniforms.uProgress.value = shockWavePhase;
                }
              }
            });
          }

          // Animate Tsunami Wave Rings if Ocean Impact
          if (isOceanEvent && craterGroup.children[0]) {
            const localCluster = craterGroup.children[0].children[0];
            if (localCluster) {
              localCluster.children.forEach((child) => {
                if (child.userData?.isTsunamiRing) {
                  const idx = child.userData.ringIndex || 0;
                  const waveExpand = 1 + blastPhase * (0.95 + idx * 0.38);
                  child.scale.set(waveExpand, waveExpand, 1);
                }
              });
            }
          }

          // -------------------------------------------------------------------------
          // PHASE 4 VISUALS (1 to 5 Minutes): Conical Ejecta Curtain, Dark Orbital Shadow Ring,
          // Persistent Molten Scar & Size/Speed-Dependent Global/Regional Firestorm Envelope
          // -------------------------------------------------------------------------
          if (!isAirburstEvent && blastPhase >= 0.24) {
            const curtainProg = Math.min(1.0, (blastPhase - 0.24) / 0.72);
            ejectaCurtainMesh.visible = true;
            ejectaCurtainMesh.position.copy(surfaceTargetPos);
            ejectaCurtainMesh.lookAt(surfaceTargetPos.clone().multiplyScalar(2));
            const curtainBaseR = craterRadiusUnits * (0.68 + 0.52 * Math.pow(curtainProg, 0.55));
            const curtainHeight =
              Math.max(4.5, Math.min(18.5, craterRadiusUnits * 0.92)) *
              Math.sin(Math.min(1.0, curtainProg * 1.15) * (Math.PI * 0.5));
            ejectaCurtainMesh.scale.set(curtainBaseR, curtainBaseR, curtainHeight);
            ejectaCurtainMat.uniforms.uPhase.value = curtainProg;
            ejectaCurtainMat.uniforms.uTime.value = elapsed;
            ejectaCurtainMat.uniforms.uIsOcean.value = isOceanEvent ? 1.0 : 0.0;

            // Dark expanding orbital shadow ring cast over the Earth below the ejecta curtain
            ejectaShadowRingMesh.visible = true;
            ejectaShadowRingMesh.position.copy(
              latLonToVector3(lat, lon, EARTH_RADIUS + 0.85)
            );
            ejectaShadowRingMesh.lookAt(
              ejectaShadowRingMesh.position.clone().multiplyScalar(2)
            );
            const shadowScale = craterRadiusUnits * (0.85 + 1.15 * Math.pow(curtainProg, 0.58));
            ejectaShadowRingMesh.scale.set(shadowScale, shadowScale, 1);
            ejectaShadowRingMat.uniforms.uOpacity.value =
              Math.sin(Math.min(1, curtainProg * 1.2) * (Math.PI * 0.5)) * 0.92;
          } else {
            ejectaCurtainMesh.visible = false;
            ejectaShadowRingMesh.visible = false;
          }

          // Persistent Glowing Molten Scar in the excavated crater basin
          if (!isAirburstEvent && !isOceanEvent && blastPhase >= 0.22) {
            const scarProg = Math.min(1.0, (blastPhase - 0.22) / 0.45);
            moltenScarMesh.visible = true;
            moltenScarMesh.position.copy(latLonToVector3(lat, lon, EARTH_RADIUS + 0.72));
            moltenScarMesh.lookAt(moltenScarMesh.position.clone().multiplyScalar(2));
            const scarRadius = craterRadiusUnits * 0.92;
            moltenScarMesh.scale.set(scarRadius, scarRadius, 1);
            moltenScarMat.uniforms.uIntensity.value = scarProg;
            moltenScarMat.uniforms.uTime.value = elapsed;
          } else {
            moltenScarMesh.visible = false;
          }

          // Re-Entry Firestorm Envelope (Global Planet-Killer Firestorm vs Continental vs Regional Thermal Ignition)
          if (res.firestorm_regime !== 'none' && !isAirburstEvent && blastPhase >= 0.38) {
            const fireProg = Math.min(1.0, (blastPhase - 0.38) / 0.62);
            firestormEnvelopeMesh.visible = true;
            firestormEnvelopeMat.uniforms.uImpactDir.value.copy(normal);
            firestormEnvelopeMat.uniforms.uMaxCoverageCos.value = getFirestormMaxCos(res);
            firestormEnvelopeMat.uniforms.uProgress.value = Math.pow(fireProg, 0.68);
            firestormEnvelopeMat.uniforms.uIntensity.value =
              res.firestorm_regime === 'global_firestorm_envelope'
                ? Math.min(1.0, fireProg * 1.25)
                : res.firestorm_regime === 'continental_firestorm'
                ? Math.min(0.88, fireProg * 1.1)
                : Math.min(0.68, fireProg * 0.95);
            firestormEnvelopeMat.uniforms.uTime.value = elapsed;
          } else {
            firestormEnvelopeMesh.visible = false;
          }

          // Animate Stratospheric Dust & Firestorm Soot Shroud if 10km Extinction or Planetary Firestorm
          const hasMajorSootVeil =
            res.impact_regime === 'crust_melt_extinction' ||
            res.firestorm_regime === 'global_firestorm_envelope' ||
            res.firestorm_regime === 'continental_firestorm';

          if (hasMajorSootVeil && blastPhase >= 0.42) {
            dustVeilMesh.visible = true;
            const maxSootOpacity = res.impact_regime === 'crust_melt_extinction' ? 0.48 : 0.32;
            dustVeilMat.opacity = Math.min(maxSootOpacity, ((blastPhase - 0.42) / 0.58) * maxSootOpacity);
            dustVeilMesh.rotation.y = elapsed * 0.022;
          } else {
            dustVeilMesh.visible = false;
          }

          // Ballistic Ejecta Boulders
          if (isAirburstEvent) {
            ejectaInstanced.visible = false;
          } else {
            ejectaInstanced.visible = true;
            if (isOceanEvent) {
              ejectaBoulderMat.color.setHex(0xe0f2fe);
              ejectaBoulderMat.emissive.setHex(0x0284c7);
            } else {
              ejectaBoulderMat.color.setHex(0x574c43);
              ejectaBoulderMat.emissive.setHex(0xff4500);
            }

            const tBallistic = blastPhase * 3.4;
            const gravity = 16.5;
            const asym = res.ejecta_butterfly_asymmetry || 0;
            for (let i = 0; i < ejectaCount; i++) {
              const b = ejectaData[i];
              const crossBoost = asym > 0.1 ? 1 + asym * Math.abs(b.velDir.y) * 0.95 : 1.0;
              const worldVel = new THREE.Vector3()
                .addScaledVector(tangent, b.velDir.x * b.speed * (1 - asym * 0.45))
                .addScaledVector(bitangent, b.velDir.y * b.speed * crossBoost)
                .addScaledVector(normal, b.velDir.z * b.speed * 1.35);

              dummyPos
                .copy(surfaceTargetPos)
                .addScaledVector(worldVel, tBallistic)
                .addScaledVector(normal, -0.5 * gravity * tBallistic * tBallistic);

              if (dummyPos.length() < EARTH_RADIUS + 0.5) {
                dummyPos.normalize().multiplyScalar(EARTH_RADIUS + 0.5);
              }

              dummyEuler.set(
                b.rotSpeed.x * tBallistic,
                b.rotSpeed.y * tBallistic,
                b.rotSpeed.z * tBallistic
              );
              dummyQuat.setFromEuler(dummyEuler);
              const s = b.scale * Math.max(0.25, 1 - blastPhase * 0.4);
              dummyScale.setScalar(s);
              dummyMatrix.compose(dummyPos, dummyQuat, dummyScale);
              ejectaInstanced.setMatrixAt(i, dummyMatrix);
            }
            ejectaInstanced.instanceMatrix.needsUpdate = true;
          }

          plumeGroup.visible = !isAirburstEvent;
          plumeGroup.children.forEach((child, idx) => {
            const mesh = child as THREE.Mesh;
            const mat = mesh.material as THREE.MeshStandardMaterial;
            const expand = Math.pow(blastPhase, 0.48) * (1 + idx * 0.25);
            mesh.scale.setScalar(expand);
            mesh.rotation.z += dt * 0.9 * (idx % 2 === 0 ? 1 : -1);
            mat.opacity = Math.max(0, (1 - Math.pow(blastPhase, 1.2)) * 0.85);
          });
        }
      } else {
        currentEntryState = calculateAtmosphericEntryState(
          simAnimRef.current.hasImpacted ? 1 : 0,
          res
        );

        if (simAnimRef.current.hasImpacted) {
          const isAirburstEvent = Boolean(res.is_airburst || res.impact_regime === 'airburst');
          const isOceanEvent = res.impact_regime === 'ocean_tsunami';
          asteroidAnchorGroup.visible = false;
          dartProbeGroup.visible = false;
          vacuumTubeMesh.visible = false;
          blindingFlashSprite.visible = false;
          vaporBubbleMesh.visible = false;
          exosphericJetMesh.visible = false;

          craterGroup.visible = true;
          craterGroup.scale.setScalar(1.0);
          ringsGroup.visible = !isAirburstEvent;
          if (!isAirburstEvent) {
            ringsGroup.children.forEach((ringChild) => {
              ((ringChild as THREE.Line).material as THREE.LineBasicMaterial).opacity = 0.72;
            });
          }

          // Keep the glowing molten scar, orbital shadow ring, and firestorm envelope visible after completion
          if (!isAirburstEvent && !isOceanEvent) {
            moltenScarMesh.visible = true;
            moltenScarMesh.position.copy(latLonToVector3(lat, lon, EARTH_RADIUS + 0.72));
            moltenScarMesh.lookAt(moltenScarMesh.position.clone().multiplyScalar(2));
            moltenScarMesh.scale.set(craterRadiusUnits * 0.92, craterRadiusUnits * 0.92, 1);
            moltenScarMat.uniforms.uIntensity.value = 0.92;
            moltenScarMat.uniforms.uTime.value = elapsed;
          } else {
            moltenScarMesh.visible = false;
          }

          if (!isAirburstEvent) {
            ejectaShadowRingMesh.visible = true;
            ejectaShadowRingMesh.position.copy(latLonToVector3(lat, lon, EARTH_RADIUS + 0.85));
            ejectaShadowRingMesh.lookAt(ejectaShadowRingMesh.position.clone().multiplyScalar(2));
            const shadowScale = craterRadiusUnits * 1.95;
            ejectaShadowRingMesh.scale.set(shadowScale, shadowScale, 1);
            ejectaShadowRingMat.uniforms.uOpacity.value = 0.65;
          } else {
            ejectaShadowRingMesh.visible = false;
          }
          ejectaCurtainMesh.visible = false;

          if (res.firestorm_regime !== 'none' && !isAirburstEvent) {
            firestormEnvelopeMesh.visible = true;
            firestormEnvelopeMat.uniforms.uImpactDir.value.copy(normal);
            firestormEnvelopeMat.uniforms.uMaxCoverageCos.value = getFirestormMaxCos(res);
            firestormEnvelopeMat.uniforms.uProgress.value = 1.0;
            firestormEnvelopeMat.uniforms.uIntensity.value =
              res.firestorm_regime === 'global_firestorm_envelope'
                ? 0.92
                : res.firestorm_regime === 'continental_firestorm'
                ? 0.78
                : 0.58;
            firestormEnvelopeMat.uniforms.uTime.value = elapsed;
          } else {
            firestormEnvelopeMesh.visible = false;
          }

          if (isAirburstEvent && craterGroup.children[0] && craterGroup.children[0].children[0]) {
            const airburstCluster = craterGroup.children[0].children[0];
            airburstCluster.children.forEach((child) => {
              if (child.userData?.isAirburstSonicWave) {
                const sMat = (child as THREE.Mesh).material as THREE.ShaderMaterial;
                if (sMat.uniforms?.uProgress) sMat.uniforms.uProgress.value = 1.0;
              }
            });
          }
          dustVeilMesh.visible =
            res.impact_regime === 'crust_melt_extinction' ||
            res.firestorm_regime === 'global_firestorm_envelope';
          if (dustVeilMesh.visible) {
            dustVeilMat.opacity = res.impact_regime === 'crust_melt_extinction' ? 0.45 : 0.28;
          }
          explosionLight.position.copy(
            latLonToVector3(lat, lon, EARTH_RADIUS + (isAirburstEvent ? 20 : 14))
          );
          explosionLight.intensity = isAirburstEvent ? 0.0 : 2.8 + Math.sin(elapsed * 3.0) * 0.6;
          ejectaInstanced.visible = false;
          fireballMat.opacity = 0;
          shockDomeMat.uniforms.uProgress.value = 1.0;
          plumeGroup.visible = false;
        } else {
          // Pre-impact Deep-Space Standby: Asteroid is cold in vacuum (ZERO plasma wake, ZERO bow-shock cone!)
          craterGroup.visible = false;
          ringsGroup.visible = false;
          ejectaInstanced.visible = false;
          plumeGroup.visible = false;
          dustVeilMesh.visible = false;
          vacuumTubeMesh.visible = false;
          blindingFlashSprite.visible = false;
          vaporBubbleMesh.visible = false;
          exosphericJetMesh.visible = false;
          ejectaCurtainMesh.visible = false;
          ejectaShadowRingMesh.visible = false;
          moltenScarMesh.visible = false;
          firestormEnvelopeMesh.visible = false;
          explosionLight.intensity = 0;
          fireballMat.opacity = 0;
          shockDomeMat.uniforms.uProgress.value = 1.0;

          asteroidAnchorGroup.visible = true;
          const standbyT = 0.04 + Math.sin(elapsed * 0.65) * 0.012;
          const pos = curve.getPoint(standbyT);
          const nextPos = curve.getPoint(standbyT + 0.02);
          asteroidAnchorGroup.position.copy(pos);
          asteroidAnchorGroup.lookAt(nextPos);

          if (rig) {
            const standbyScale = getAsteroidVisualScale(res.diameter_m);
            rig.coreGroup.scale.setScalar(standbyScale);
            rig.primaryMesh.rotation.x = elapsed * 0.42;
            rig.primaryMesh.rotation.y = elapsed * 0.58;
            rig.bouldersInstanced.rotation.copy(rig.primaryMesh.rotation);
            if (rig.moonletPivot) {
              rig.moonletPivot.rotation.y = elapsed * 1.1;
            }
            // Strictly cold in deep space!
            rig.primaryMat.emissiveIntensity = 0.0;
            rig.setThermalAblationState(0.0, elapsed);
            rig.bowShockMesh.visible = false;
            rig.plasmaWakeInner.visible = false;
            rig.plasmaWakeOuter.visible = false;
            rig.ablationParticles.visible = false;
            rig.childFragmentsGroup.visible = false;
            rig.plasmaLight.intensity = 0.0;
            rig.entryCorridorGroup.visible = false;
          }

          dartProbeGroup.visible = true;
          dartProbeGroup.position.set(
            pos.x + Math.cos(elapsed * 0.9) * 16,
            pos.y + Math.sin(elapsed * 0.9) * 9 + 5,
            pos.z + Math.sin(elapsed * 0.9) * 14
          );
          dartProbeGroup.lookAt(pos);

          if (stateRef.current.cameraPreset === 'asteroid' && !camTrans?.active) {
            controls.target.lerp(pos, 0.08);
          }
        }

        if (showDeflect && defRes && sceneObjectsRef.current.deflectedLine) {
          sceneObjectsRef.current.deflectedLine.visible = true;
        }
      }

      // Only show the Top-Right 2D Topographic Cross-Section when explicitly pinned by the user (NEVER auto-pop an atmospheric entry cam!)
      const shouldShowSplit = currentSplitMode === 'pinned';
      sceneObjectsRef.current.isSplitActiveRef = shouldShowSplit;

      const pipDisplayTelemetry: AtmosphericEntryTelemetry = calculateAtmosphericEntryState(
        0.84,
        res
      );

      // Throttle React HUD telemetry state updates to ~15fps so WebGL runs at locked 60fps
      if (now - lastHudSyncTime > 65) {
        lastHudSyncTime = now;
        setSplitScreenActive(shouldShowSplit);
        if (shouldShowSplit) {
          setEntryHudTelemetry(pipDisplayTelemetry);
        }
      }

      controls.update();

      const canvasW = container.clientWidth || window.innerWidth;
      const canvasH = container.clientHeight || window.innerHeight;

      // Render the Main 3D Earth across 100% of the viewport canvas
      if (rig) rig.entryCorridorGroup.visible = false;
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, canvasW, canvasH);
      camera.aspect = canvasW / Math.max(1, canvasH);
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);

      frameTimerId = window.setTimeout(() => {
        animationFrameId = requestAnimationFrame(animate);
      }, 32);
    };

    animate();

    return () => {
      window.clearTimeout(frameTimerId);
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      renderer.domElement.removeEventListener('pointermove', handlePointerMove);
      renderer.domElement.removeEventListener('pointerleave', handlePointerLeave);
      renderer.domElement.removeEventListener('pointerup', handlePointerUp);
      controls.dispose();
      renderer.dispose();
    };
  }, []);

  // Camera View Preset Transitions
  useEffect(() => {
    const { camera, controls, cameraTransition } = sceneObjectsRef.current;
    if (!camera || !controls || !cameraTransition) return;

    const targetSurface = latLonToVector3(selectedLat, selectedLon, EARTH_RADIUS);
    const normal = targetSurface.clone().normalize();
    const tangent = new THREE.Vector3(0, 1, 0).cross(normal).normalize();
    if (tangent.lengthSq() < 0.01) tangent.set(1, 0, 0);
    const bitangent = normal.clone().cross(tangent).normalize();

    const angleDeg = activeResult?.angle_deg || 45;
    const elevRad = (Math.max(15, angleDeg) * Math.PI) / 180;
    const incomingDir = normal
      .clone()
      .multiplyScalar(Math.sin(elevRad))
      .add(tangent.clone().multiplyScalar(Math.cos(elevRad)))
      .normalize();

    const startPos = targetSurface.clone().add(incomingDir.clone().multiplyScalar(185));
    const controlPoint = targetSurface
      .clone()
      .add(incomingDir.clone().multiplyScalar(98))
      .add(bitangent.clone().multiplyScalar(38));
    const curve = new THREE.QuadraticBezierCurve3(startPos, controlPoint, targetSurface);
    const asteroidPos = curve.getPoint(0.04);

    cameraTransition.startPos.copy(camera.position);
    cameraTransition.startTarget.copy(controls.target);
    cameraTransition.progress = 0;
    cameraTransition.active = true;

    if (cameraPreset === 'asteroid') {
      const camOffset = bitangent
        .clone()
        .multiplyScalar(24)
        .add(normal.clone().multiplyScalar(11))
        .add(incomingDir.clone().multiplyScalar(16));
      cameraTransition.endPos.copy(asteroidPos).add(camOffset);
      cameraTransition.endTarget.copy(asteroidPos.clone().lerp(targetSurface, 0.18));
    } else if (cameraPreset === 'horizon') {
      const skimPos = targetSurface
        .clone()
        .multiplyScalar(1.16)
        .sub(tangent.clone().multiplyScalar(58))
        .add(bitangent.clone().multiplyScalar(22));
      cameraTransition.endPos.copy(skimPos);
      cameraTransition.endTarget.copy(targetSurface.clone().multiplyScalar(0.98));
    } else if (cameraPreset === 'moon') {
      cameraTransition.endPos.set(-165, 130, 350);
      cameraTransition.endTarget.set(-35, 15, -25);
    } else {
      const camPos = normal
        .clone()
        .multiplyScalar(256)
        .add(bitangent.clone().multiplyScalar(78))
        .add(new THREE.Vector3(0, 28, 0));
      cameraTransition.endPos.copy(camPos);
      cameraTransition.endTarget
        .copy(targetSurface.clone().multiplyScalar(0.28))
        .add(new THREE.Vector3(0, -18, 0));
    }
  }, [cameraPreset, centerTrigger]);

  // Rebuild Regime-Specific 3D Crater, Concentric Blast Rings, Plume & Trajectory Tubes when parameters or coordinates change
  useEffect(() => {
    const {
      markerGroup,
      craterGroup,
      ringsGroup,
      earthGroup,
      plumeGroup,
      astAlbedo,
      astBump,
      deformEarthAndCloudsForCrater,
    } = sceneObjectsRef.current;
    if (!markerGroup || !craterGroup || !ringsGroup || !earthGroup || !plumeGroup) return;

    const targetPos = latLonToVector3(selectedLat, selectedLon, EARTH_RADIUS + 1.2);
    markerGroup.position.copy(targetPos);
    markerGroup.lookAt(targetPos.clone().multiplyScalar(2));

    while (craterGroup.children.length > 0) {
      const child = craterGroup.children[0];
      craterGroup.remove(child);
    }

    while (ringsGroup.children.length > 0) {
      const child = ringsGroup.children[0] as THREE.Object3D;
      ringsGroup.remove(child);
    }

    while (plumeGroup.children.length > 0) {
      const child = plumeGroup.children[0] as THREE.Mesh;
      if (child.geometry) child.geometry.dispose();
      plumeGroup.remove(child);
    }

    const craterRadiusUnits =
      activeResult?.impact_regime === 'crust_melt_extinction'
        ? 20.5
        : activeResult?.impact_regime === 'simple_crater'
        ? Math.max(4.2, Math.min(7.2, Math.log10((activeResult?.tnt_megatons || 10) + 1) * 2.4))
        : Math.max(5.8, Math.min(18, Math.log10((activeResult?.tnt_megatons || 10) + 1) * 3.2));

    if (!simAnimRef.current.hasImpacted && !simAnimRef.current.active) {
      if (deformEarthAndCloudsForCrater) {
        deformEarthAndCloudsForCrater(
          selectedLat,
          selectedLon,
          craterRadiusUnits,
          0,
          0,
          activeResult.impact_regime
        );
      }
      craterGroup.visible = false;
      ringsGroup.visible = false;
    }

    if (astAlbedo && astBump && activeResult) {
      const regimeCrater = buildRegimeSpecific3DCrater(
        selectedLat,
        selectedLon,
        EARTH_RADIUS,
        craterRadiusUnits,
        activeResult,
        astAlbedo,
        astBump,
        (lat, lon, r) => latLonToVector3(lat, lon, r)
      );
      craterGroup.add(regimeCrater);
    }

    if (activeResult) {
      const ringSpecs = [
        {
          radiusKm: Math.max(240, (activeResult.severe_blast_km || 35) * 4.5),
          color: activeResult.is_ocean_impact ? 0x0ea5e9 : 0xf97316,
          altitude: EARTH_RADIUS + 1.85,
        },
        {
          radiusKm: Math.max(520, (activeResult.thermal_burn_km || 120) * 3.6),
          color: activeResult.is_ocean_impact ? 0x38bdf8 : 0xef4444,
          altitude: EARTH_RADIUS + 1.75,
        },
        {
          radiusKm: Math.max(840, (activeResult.blast_km || 250) * 2.6),
          color: activeResult.is_ocean_impact ? 0xbae6fd : 0x38bdf8,
          altitude: EARTH_RADIUS + 1.65,
        },
      ];

      for (const spec of ringSpecs) {
        const geo = createGeodesicCircleGeometry(
          selectedLat,
          selectedLon,
          spec.radiusKm,
          spec.altitude,
          128
        );
        const mat = new THREE.LineBasicMaterial({
          color: spec.color,
          transparent: true,
          opacity: 0.72,
        });
        const line = new THREE.Line(geo, mat);
        ringsGroup.add(line);
      }

      const normal = targetPos.clone().normalize();
      const isOcean = activeResult.impact_regime === 'ocean_tsunami';
      for (let i = 0; i < 6; i++) {
        const radius = i === 5 ? craterRadiusUnits * 1.45 : craterRadiusUnits * (0.45 + i * 0.14);
        const tube = i === 5 ? craterRadiusUnits * 0.42 : craterRadiusUnits * 0.18;
        const torusGeo = new THREE.TorusGeometry(radius, tube, 12, 32);
        const torusMat = new THREE.MeshStandardMaterial({
          color: isOcean ? 0xe0f2fe : i % 2 === 0 ? 0x443c35 : 0x292420,
          emissive: new THREE.Color(isOcean ? 0x0284c7 : i < 3 ? 0xff5500 : 0xd97706),
          emissiveIntensity: 1.4 - i * 0.18,
          roughness: isOcean ? 0.3 : 0.9,
          transparent: true,
          opacity: 0,
          flatShading: true,
        });
        const torus = new THREE.Mesh(torusGeo, torusMat);
        torus.position.copy(targetPos).add(normal.clone().multiplyScalar(2.2 + i * 3.6));
        torus.lookAt(targetPos.clone().multiplyScalar(2));
        plumeGroup.add(torus);
      }
    }

    if (sceneObjectsRef.current.trajectoryLine) {
      sceneObjectsRef.current.trajectoryLine.geometry.dispose();
      earthGroup.remove(sceneObjectsRef.current.trajectoryLine);
    }
    if (sceneObjectsRef.current.deflectedLine) {
      sceneObjectsRef.current.deflectedLine.geometry.dispose();
      earthGroup.remove(sceneObjectsRef.current.deflectedLine);
    }

    const normal = targetPos.clone().normalize();
    const tangent = new THREE.Vector3(0, 1, 0).cross(normal).normalize();
    if (tangent.lengthSq() < 0.01) tangent.set(1, 0, 0);
    const bitangent = normal.clone().cross(tangent).normalize();

    const angleDeg = activeResult?.angle_deg || 45;
    const elevRad = (Math.max(15, angleDeg) * Math.PI) / 180;
    const incomingDir = normal
      .clone()
      .multiplyScalar(Math.sin(elevRad))
      .add(tangent.clone().multiplyScalar(Math.cos(elevRad)))
      .normalize();

    const startPos = targetPos.clone().add(incomingDir.clone().multiplyScalar(185));
    const controlPoint = targetPos
      .clone()
      .add(incomingDir.clone().multiplyScalar(98))
      .add(bitangent.clone().multiplyScalar(38));
    const curve = new THREE.QuadraticBezierCurve3(startPos, controlPoint, targetPos);

    const tubeGeo = new THREE.TubeGeometry(curve, 72, 0.32, 8, false);
    const tubeMat = new THREE.MeshBasicMaterial({
      color: 0xff6b00,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
    });
    const trajectoryLine = new THREE.Mesh(tubeGeo, tubeMat);
    earthGroup.add(trajectoryLine);
    sceneObjectsRef.current.trajectoryLine = trajectoryLine;

    if (showDeflectionArc && deflectionResult) {
      const missOffset = Math.min(85, 22 + (deflectionResult.earth_radii_clearance || 1.5) * 26);
      const deflectedEnd = targetPos
        .clone()
        .add(normal.clone().multiplyScalar(missOffset))
        .add(bitangent.clone().multiplyScalar(42));
      const deflectCurve = new THREE.QuadraticBezierCurve3(
        startPos,
        controlPoint.clone().add(normal.clone().multiplyScalar(missOffset * 0.55)),
        deflectedEnd
      );
      const deflectTubeGeo = new THREE.TubeGeometry(deflectCurve, 72, 0.42, 8, false);
      const deflectMat = new THREE.MeshBasicMaterial({
        color: deflectionResult.status === 'DEFLECTED' ? 0x10b981 : 0x38bdf8,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
      });
      const deflectedLine = new THREE.Mesh(deflectTubeGeo, deflectMat);
      earthGroup.add(deflectedLine);
      sceneObjectsRef.current.deflectedLine = deflectedLine;
    }
  }, [selectedLat, selectedLon, activeResult, showDeflectionArc, deflectionResult]);

  const overpressurePct = Math.min(
    100,
    Math.round((entryHudTelemetry.ramPressureMPa / Math.max(0.1, entryHudTelemetry.yieldStrengthMPa)) * 100)
  );

  const isComplexCrater =
    activeResult.impact_regime === 'complex_crater' ||
    activeResult.impact_regime === 'crust_melt_extinction';

  return (
    <div className="relative w-full h-full">
      <div
        ref={mountRef}
        className="w-full h-full cursor-crosshair active:cursor-grabbing select-none"
        aria-label="Interactive 3D Planetary Impact Observatory"
      />

      {/* OPTIONAL PINNED 2D USGS TOPOGRAPHIC CRATER CROSS-SECTION (Clean 2D Profile Only — Atmospheric Entry Cam Removed) */}
      {splitScreenActive && (
        <aside
          aria-label="2D Topographic Crater Cross-Section"
          className="pointer-events-auto absolute top-[136px] right-2.5 sm:top-3.5 sm:right-4 z-30 w-[calc(100vw-20px)] max-w-[390px] sm:max-w-none sm:w-[396px] bg-[#090807]/96 border border-[#443A31] shadow-2xl backdrop-blur-md"
        >
          <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-[#2E2720] bg-[#12100E]">
            <span className="text-[11px] font-mono uppercase tracking-wider text-[#38BDF8] font-bold">
              2D USGS Crater & Ejecta Cross-Section
            </span>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setIsPipCollapsed((prev) => !prev)}
                className="asteroid-chip px-2 py-1 text-[11px] font-mono uppercase bg-[#1C1815] hover:bg-[#2B180C] text-[#E7E2DC] hover:text-[#FDBA74] border border-[#443A31] cursor-pointer whitespace-nowrap"
              >
                {isPipCollapsed ? 'Expand' : 'Min'}
              </button>
              {onChangeSplitCamMode && (
                <button
                  type="button"
                  onClick={() => onChangeSplitCamMode('hidden')}
                  className="asteroid-chip px-2 py-1 text-[11px] font-mono uppercase bg-[#1C1815] hover:bg-[#2B180C] text-[#D6D3D1] hover:text-[#FDBA74] border border-[#443A31] cursor-pointer whitespace-nowrap"
                >
                  Close
                </button>
              )}
            </div>
          </div>

          {!isPipCollapsed && (
            <div className="p-3 space-y-2.5">
              <div
                ref={pipViewportRef}
                className="relative w-full h-40 sm:h-44 border border-[#38BDF8]/70 bg-[#07080C] overflow-hidden p-2 flex flex-col justify-between"
              >
                <div className="flex items-center justify-between text-[11px] font-mono text-[#D6D3D1] z-10">
                  <span className="text-[#38BDF8] font-bold uppercase">
                    USGS Topo ({activeResult.terrain_elevation_m >= 0 ? '+' : ''}
                    {activeResult.terrain_elevation_m}m)
                  </span>
                  <span className="text-[#FDBA74] font-semibold tabular-nums">
                    θ = {activeResult.angle_deg}° (e = {activeResult.crater_ellipticity.toFixed(2)})
                  </span>
                </div>

                <svg
                  viewBox="0 0 280 105"
                  className="w-full h-28 overflow-visible"
                  aria-label="2D Topographic Crater Depth and Rim Height Cross-Section"
                >
                  <line
                    x1="0"
                    y1="48"
                    x2="280"
                    y2="48"
                    stroke="#334155"
                    strokeDasharray="3 3"
                    strokeWidth="0.8"
                  />
                  <text x="4" y="44" fill="#CBD5E1" fontSize="8" fontFamily="monospace">
                    Pre-Impact Datum ({activeResult.terrain_elevation_m >= 0 ? '+' : ''}
                    {activeResult.terrain_elevation_m}m)
                  </text>

                  {activeResult.is_airburst ? (
                    <>
                      <path
                        d="M 0 48 Q 70 46, 140 48 T 280 47 L 280 102 L 0 102 Z"
                        fill="#1E1B18"
                        stroke="#78716C"
                        strokeWidth="1.4"
                      />
                      <circle cx="140" cy="18" r="5" fill="#E0F2FE" />
                      <circle
                        cx="140"
                        cy="18"
                        r="14"
                        fill="none"
                        stroke="#38BDF8"
                        strokeWidth="1.3"
                        strokeDasharray="3 2"
                      />
                      <path
                        d="M 102 36 Q 140 50, 178 36"
                        fill="none"
                        stroke="#7DD3FC"
                        strokeWidth="1.2"
                      />
                      <text
                        x="140"
                        y="10"
                        textAnchor="middle"
                        fill="#38BDF8"
                        fontSize="8"
                        fontFamily="monospace"
                        fontWeight="bold"
                      >
                        AIRBURST @ {activeResult.burst_altitude_km.toFixed(1)} KM (NO CRATER)
                      </text>
                      <text
                        x="140"
                        y="76"
                        textAnchor="middle"
                        fill="#D6D3D1"
                        fontSize="8"
                        fontFamily="monospace"
                      >
                        Bedrock Intact · 0.00m Ground Excavation
                      </text>
                    </>
                  ) : (
                    <>
                      <path
                        d="M 196 36 Q 235 42, 276 47 L 276 48 L 196 48 Z"
                        fill="#9A3412"
                        fillOpacity="0.45"
                      />
                      <path
                        d="M 12 47 Q 45 43, 84 38 L 84 48 L 12 48 Z"
                        fill="#9A3412"
                        fillOpacity="0.3"
                      />
                      <path
                        d={
                          isComplexCrater
                            ? 'M 0 48 L 52 46 L 84 35 L 102 68 L 124 84 L 140 66 L 156 84 L 178 66 L 196 33 L 238 46 L 280 48 L 280 102 L 0 102 Z'
                            : 'M 0 48 L 58 46 L 88 36 Q 140 96, 192 34 L 232 46 L 280 48 L 280 102 L 0 102 Z'
                        }
                        fill="#171412"
                        stroke="#F97316"
                        strokeWidth="1.6"
                      />
                      <path
                        d={
                          isComplexCrater
                            ? 'M 112 80 Q 140 70, 168 80 Q 140 88, 112 80 Z'
                            : 'M 115 76 Q 140 89, 165 76 Z'
                        }
                        fill="#EA580C"
                      />
                      <line x1="86" y1="24" x2="194" y2="24" stroke="#FDBA74" strokeWidth="1" />
                      <text
                        x="140"
                        y="20"
                        textAnchor="middle"
                        fill="#FDBA74"
                        fontSize="8"
                        fontFamily="monospace"
                        fontWeight="bold"
                      >
                        {activeResult.crater_Major_axis_km.toFixed(2)} ×{' '}
                        {activeResult.crater_minor_axis_km.toFixed(2)} km
                      </text>
                      <text x="198" y="32" fill="#38BDF8" fontSize="7.5" fontFamily="monospace">
                        Rim +{activeResult.rim_height_m}m
                      </text>
                      <text
                        x="140"
                        y="97"
                        textAnchor="middle"
                        fill="#FCA5A5"
                        fontSize="8"
                        fontFamily="monospace"
                        fontWeight="bold"
                      >
                        Depth -{activeResult.crater_depth_km.toFixed(2)} km · Downrange Ejecta{' '}
                        {activeResult.downrange_ejecta_reach_km.toFixed(1)} km
                      </text>
                    </>
                  )}
                </svg>
              </div>

              {/* Aerodynamic Ram Pressure vs Material Yield Strength Telemetry Box (High-Contrast 12px Layout) */}
              <div className="bg-[#12100E] border border-[#2E2720] px-3 py-2.5 space-y-2">
                <div className="flex items-center justify-between gap-2 text-xs font-mono tabular-nums">
                  <span className="text-[#F5F0EB] font-medium">
                    Ram Pressure (P = ρv²):{' '}
                    <strong className="text-[#FF6B00] font-bold">
                      {entryHudTelemetry.ramPressureMPa.toFixed(2)} MPa
                    </strong>
                  </span>
                  <span className="text-[#E7E2DC] font-medium shrink-0">
                    Y<sub>0</sub>:{' '}
                    <strong className="text-[#FDBA74] font-bold">
                      {entryHudTelemetry.yieldStrengthMPa.toFixed(2)} MPa
                    </strong>
                  </span>
                </div>

                <div className="w-full h-2 bg-[#1C1815] border border-[#443A31] overflow-hidden">
                  <div
                    className={`h-full transition-all duration-75 ${
                      entryHudTelemetry.isFragmenting ? 'bg-[#EF4444]' : 'bg-[#FF6B00]'
                    }`}
                    style={{ width: `${Math.max(8, overpressurePct)}%` }}
                  />
                </div>

                <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-[#29231D] text-xs font-mono">
                  <span className="uppercase font-bold tracking-tight text-[#FDBA74]">
                    {activeResult.firestorm_label}
                  </span>
                  <span className="text-[#7DD3FC] uppercase font-bold shrink-0 tabular-nums">
                    {activeResult.is_airburst
                      ? `Burst: ${activeResult.burst_altitude_km.toFixed(1)} km`
                      : `Depth: ${activeResult.crater_depth_km.toFixed(2)} km`}
                  </span>
                </div>
              </div>
            </div>
          )}
        </aside>
      )}

      {/* Mouse-Following 3D Globe Coordinate & USGS Elevation Tooltip (Enhanced Font Size & Contrast) */}
      <div
        ref={hoverTooltipRef}
        style={{ opacity: 0 }}
        className="pointer-events-none fixed top-0 left-0 z-20 bg-[#0A0807]/98 border border-[#FF6B00] px-3.5 py-1.5 text-xs sm:text-[13px] font-mono text-[#F5F0EB] shadow-2xl backdrop-blur-md flex items-center gap-2.5 transition-opacity duration-75"
      >
        <span className="w-2.5 h-2.5 bg-[#FF6B00] inline-block rotate-45 shrink-0 shadow-[0_0_8px_#FF6B00]" />
        <span className="text-[#FDBA74] uppercase text-[11px] font-bold tracking-wider">TARGET:</span>
        <strong ref={hoverCoordsTextRef} className="text-white font-bold tabular-nums whitespace-nowrap text-xs sm:text-[13px]">
          35.03° N, 111.02° W
        </strong>
        <span className="text-[#55473A]">|</span>
        <span
          ref={hoverElevationTextRef}
          className="text-[#7DD3FC] font-mono tabular-nums text-xs font-semibold"
        >
          +1,260m
        </span>
        <span className="text-[#55473A]">|</span>
        <span ref={hoverSurfaceTextRef} className="text-[#FDBA74] font-bold uppercase text-xs tracking-wider">
          LAND
        </span>
      </div>
    </div>
  );
};
