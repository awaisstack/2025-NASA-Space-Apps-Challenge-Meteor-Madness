import React, { useEffect, useState, useMemo } from 'react';
import {
  CompositionType,
  NeoObject,
  ImpactSimulationResult,
  DeflectionParameters,
  SplitCamMode,
} from './types';
import {
  calculateImpactPhysics,
  calculateDeflectionPhysics,
  getAsteroidMorphologySpec,
  isOceanCoordinate,
  CURATED_NEOS,
  TARGET_PRESETS,
  formatLargeNumber,
} from './utils/impactPhysics';
import { EarthViewport, CameraViewPreset } from './components/EarthViewport';
import { ProfessorAcademyDrawer } from './components/ProfessorAcademyDrawer';
import { soundEngine } from './utils/soundEngine';
import {
  Flame,
  Volume2,
  VolumeX,
  Crosshair,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Camera,
  Snowflake,
  Layers,
  Hexagon,
  Shield,
  Maximize2,
  Minimize2,
  Zap,
  Compass,
  Columns,
  MapPin,
  Users,
  Skull,
  DollarSign,
} from 'lucide-react';

export default function App() {
  // Asteroid Physical Parameters (Default: Impactor-2025 NASA Space Apps Scenario)
  const [diameterM, setDiameterM] = useState<number>(300);
  const [velocityKms, setVelocityKms] = useState<number>(25);
  const [angleDeg, setAngleDeg] = useState<number>(45);
  const [composition, setComposition] = useState<CompositionType>('stony');

  // Target Location State
  const [selectedLat, setSelectedLat] = useState<number>(35.03);
  const [selectedLon, setSelectedLon] = useState<number>(-111.02);
  const [selectedLocationLabel, setSelectedLocationLabel] = useState<string>(
    'Barringer Crater, Arizona'
  );
  const [targetDensity, setTargetDensity] = useState<number>(2700);

  // NASA NEO Catalog State
  const [neos, setNeos] = useState<NeoObject[]>(CURATED_NEOS);
  const [selectedNeoId, setSelectedNeoId] = useState<string>('impactor-2025');
  const [neoSource, setNeoSource] = useState<string>('curated');

  // Simulation & Reset Triggers
  const [simulationTrigger, setSimulationTrigger] = useState<number>(0);
  const [resetTrigger, setResetTrigger] = useState<number>(0);
  const [centerTrigger, setCenterTrigger] = useState<number>(0);
  const [cameraPreset, setCameraPreset] = useState<CameraViewPreset>('orbital');
  const [splitCamMode, setSplitCamMode] = useState<SplitCamMode>('auto');
  const [simPhase, setSimPhase] = useState<'idle' | 'approaching' | 'detonating' | 'complete'>('idle');
  const [manualScrubProgress, setManualScrubProgress] = useState<number | null>(null);

  // Top-Left Telemetry Scrim Collapsible State
  const [isHudCollapsed, setIsHudCollapsed] = useState<boolean>(false);

  // Planetary Defense (DART) State
  const [deflectionParams, setDeflectionParams] = useState<DeflectionParameters>({
    diameter_m: 300,
    composition: 'stony',
    warning_years: 6,
    impactor_mass_kg: 1500,
    relative_impact_vel_km_s: 12,
    beta_factor: 3.6,
    method: 'kinetic_impactor',
  });
  const [showDeflectionArc, setShowDeflectionArc] = useState<boolean>(false);

  // UI Navigation & Drawer State
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [drawerMode, setDrawerMode] = useState<'academy' | 'deflection'>('academy');
  const [isDockCollapsed, setIsDockCollapsed] = useState<boolean>(false);
  const [activeDockTab, setActiveDockTab] = useState<'parameters' | 'targets' | 'dart'>('parameters');
  const [isAudioMuted, setIsAudioMuted] = useState<boolean>(false);

  // Fetch Live NASA NeoWs Catalog on Mount (Merging with curated scientific reference NEOs)
  useEffect(() => {
    let active = true;
    fetch('/api/neos')
      .then((res) => res.json())
      .then((data) => {
        if (!active) return;
        const neoList: NeoObject[] = Array.isArray(data?.neos)
          ? data.neos
          : Array.isArray(data?.items)
          ? data.items
          : [];
        if (neoList.length > 0) {
          const existingIds = new Set(CURATED_NEOS.map((n) => n.id));
          const merged = [
            ...CURATED_NEOS,
            ...neoList.filter((item: NeoObject) => !existingIds.has(item.id)),
          ];
          setNeos(merged);
          setNeoSource(data.source || 'nasa_neows_live');
        }
      })
      .catch(() => {
        // Fallback to curated NASA NEOs
      });
    return () => {
      active = false;
    };
  }, []);

  // Synchronize deflection parameters with current asteroid size & composition
  useEffect(() => {
    setDeflectionParams((prev) => ({
      ...prev,
      diameter_m: diameterM,
      composition,
    }));
  }, [diameterM, composition]);

  // Real-time Impact Physics, USGS Elevation & Socioeconomic Calculation
  const activeResult: ImpactSimulationResult = useMemo(() => {
    return calculateImpactPhysics({
      diameter_m: diameterM,
      velocity_km_s: velocityKms,
      angle_deg: angleDeg,
      composition,
      target_density_kg_m3: targetDensity,
      target_lat: selectedLat,
      target_lon: selectedLon,
    });
  }, [diameterM, velocityKms, angleDeg, composition, targetDensity, selectedLat, selectedLon]);

  // Real-time 3D Asteroid Morphology Spec
  const morphologySpec = useMemo(() => {
    return getAsteroidMorphologySpec(selectedNeoId, composition, diameterM);
  }, [selectedNeoId, composition, diameterM]);

  // Real-time Deflection Calculation
  const deflectionResult = useMemo(() => {
    return calculateDeflectionPhysics(deflectionParams);
  }, [deflectionParams]);

  // Handle selecting a NASA NEO preset (resets Earth to pristine standby until launched)
  const handleSelectNeo = (neoId: string) => {
    soundEngine.stopActiveSounds();
    soundEngine.playTick();
    setSelectedNeoId(neoId);
    setManualScrubProgress(null);
    setSimPhase('idle');
    setResetTrigger((r) => r + 1);
    const found = neos.find((n) => n.id === neoId);
    if (found) {
      setDiameterM(Math.max(5, Math.min(15000, Math.round(found.est_diameter_m_avg))));
      setVelocityKms(Math.max(11, Math.min(72, Math.round(found.est_velocity_km_s * 10) / 10)));
      if (found.composition_hint) {
        setComposition(found.composition_hint);
      }
    }
  };

  // Handle Reset to Default (Impactor-2025 Scenario)
  const handleResetDefaults = () => {
    soundEngine.stopActiveSounds();
    soundEngine.playTick();
    setSelectedNeoId('impactor-2025');
    setDiameterM(300);
    setVelocityKms(25);
    setAngleDeg(45);
    setComposition('stony');
    setSelectedLat(35.03);
    setSelectedLon(-111.02);
    setSelectedLocationLabel('Barringer Crater, Arizona');
    setTargetDensity(2700);
    setManualScrubProgress(null);
    setSimPhase('idle');
    setCameraPreset('orbital');
    setResetTrigger((r) => r + 1);
    setCenterTrigger((c) => c + 1);
  };

  // Handle clicking a globe coordinate -> locks target coordinates & detects Ocean vs Continent!
  const handleSelectLocation = (lat: number, lon: number, label?: string, explicitDensity?: number) => {
    soundEngine.stopActiveSounds();
    soundEngine.playTargetLock();
    setSelectedLat(lat);
    setSelectedLon(lon);
    const isOcean = explicitDensity !== undefined ? explicitDensity <= 1500 : isOceanCoordinate(lat, lon);
    setTargetDensity(explicitDensity !== undefined ? explicitDensity : isOcean ? 1025 : 2700);
    if (label) {
      setSelectedLocationLabel(label);
    } else {
      setSelectedLocationLabel(
        `${isOcean ? 'Oceanic Basin' : 'Continental Crust'} (${lat.toFixed(2)}°N, ${lon.toFixed(2)}°E)`
      );
    }
    setManualScrubProgress(null);
    setSimPhase('idle');
    setResetTrigger((r) => r + 1);
  };

  // Trigger 3D Impact Animation (Only when Launch / Simulate Impact is clicked)
  const handleTriggerSimulation = () => {
    soundEngine.playLaunchSequence(activeResult);
    setIsDrawerOpen(false);
    setManualScrubProgress(null);
    setSimulationTrigger((prev) => prev + 1);
  };

  // Toggle Audio
  const handleToggleAudio = () => {
    const nextMuted = !isAudioMuted;
    setIsAudioMuted(nextMuted);
    soundEngine.setMuted(nextMuted);
    if (!nextMuted) {
      soundEngine.playTick(660);
    }
  };

  const socio = activeResult.socioeconomic;

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#050506] text-[#F5F0EB] flex flex-col select-none">
      {/* TOP NAVIGATION BAR — Sleek 44px Monolith Header */}
      <header className="relative z-20 flex items-center justify-between gap-6 px-5 py-2 bg-[#090807]/95 border-b border-[#362E26] shrink-0">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#observatory"
          onClick={(e) => {
            e.preventDefault();
            setIsDrawerOpen(false);
          }}
          className="text-base font-display font-bold tracking-wider uppercase text-[#F5F0EB] whitespace-nowrap shrink-0"
        >
          ImpactScope
        </a>

        {/* Zone 2: 4 concise navigation links with active fill */}
        <nav
          aria-label="Primary Workspace Navigation"
          className="hidden md:flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-[#D6D3D1]"
        >
          <a
            href="#simulator"
            onClick={(e) => {
              e.preventDefault();
              setIsDrawerOpen(false);
              setIsDockCollapsed(false);
              setActiveDockTab('parameters');
            }}
            className={`asteroid-chip px-3 py-1 transition-all whitespace-nowrap shrink-0 ${
              !isDrawerOpen && activeDockTab === 'parameters'
                ? 'bg-[#2B180C] text-[#FDBA74] border border-[#FF6B00] font-bold'
                : 'hover:text-white hover:bg-[#161310]'
            }`}
          >
            Impact Simulator
          </a>
          <a
            href="#targets"
            onClick={(e) => {
              e.preventDefault();
              setIsDrawerOpen(false);
              setIsDockCollapsed(false);
              setActiveDockTab('targets');
            }}
            className={`asteroid-chip px-3 py-1 transition-all whitespace-nowrap shrink-0 ${
              !isDrawerOpen && activeDockTab === 'targets'
                ? 'bg-[#2B180C] text-[#FDBA74] border border-[#FF6B00] font-bold'
                : 'hover:text-white hover:bg-[#161310]'
            }`}
          >
            Target Coordinates
          </a>
          <a
            href="#deflection"
            onClick={(e) => {
              e.preventDefault();
              setIsDrawerOpen(false);
              setIsDockCollapsed(false);
              setActiveDockTab('dart');
              setShowDeflectionArc(true);
            }}
            className={`asteroid-chip px-3 py-1 transition-all whitespace-nowrap shrink-0 ${
              (!isDrawerOpen && activeDockTab === 'dart') || (isDrawerOpen && drawerMode === 'deflection')
                ? 'bg-[#0E2433] text-[#7DD3FC] border border-[#38BDF8] font-bold'
                : 'hover:text-white hover:bg-[#161310]'
            }`}
          >
            Planetary Defense
          </a>
          <a
            href="#academy"
            onClick={(e) => {
              e.preventDefault();
              setDrawerMode('academy');
              setIsDrawerOpen(true);
            }}
            className={`asteroid-chip px-3 py-1 transition-all whitespace-nowrap shrink-0 ${
              isDrawerOpen && drawerMode === 'academy'
                ? 'bg-[#2B180C] text-[#FDBA74] border border-[#FF6B00] font-bold'
                : 'hover:text-white hover:bg-[#161310]'
            }`}
          >
            Physics Briefing
          </a>
        </nav>

        {/* Zone 3: Primary Action CTA */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleTriggerSimulation}
            className="asteroid-btn px-3.5 py-1.5 text-xs font-mono font-bold uppercase tracking-wider text-white bg-gradient-to-r from-[#EA580C] via-[#DC2626] to-[#EA580C] hover:brightness-110 border border-[#FDBA74]/70 shadow-[0_0_16px_rgba(234,88,12,0.5)] transition-all whitespace-nowrap shrink-0 cursor-pointer"
          >
            Simulate Impact
          </button>
        </div>
      </header>

      {/* MAIN 3D PLANETARY VIEWPORT (85%+ Unobstructed 3D Space + Top-Right Dual PiP) */}
      <main className="relative flex-1 w-full h-full overflow-hidden">
        <EarthViewport
          selectedLat={selectedLat}
          selectedLon={selectedLon}
          selectedNeoId={selectedNeoId}
          onSelectLocation={(lat, lon, label) => handleSelectLocation(lat, lon, label)}
          simulationTrigger={simulationTrigger}
          resetTrigger={resetTrigger}
          centerTrigger={centerTrigger}
          cameraPreset={cameraPreset}
          splitCamMode={splitCamMode}
          onChangeSplitCamMode={setSplitCamMode}
          activeResult={activeResult}
          deflectionResult={deflectionResult}
          showDeflectionArc={showDeflectionArc}
          manualScrubProgress={manualScrubProgress}
          onSimulationPhaseChange={(phase) => {
            setSimPhase(phase);
            if (phase === 'detonating') {
              soundEngine.playImpactDetonation(activeResult);
            }
          }}
        />

        {/* Top-Left Telemetry Scrim (Collapsible HUD + Clean 3-Card Impact Stats Grid) */}
        <div className="pointer-events-none absolute top-2.5 left-3 sm:top-3.5 sm:left-4 z-10 w-[calc(100vw-24px)] sm:w-auto sm:min-w-[420px] sm:max-w-[540px] md:max-w-[580px]">
          <div className="hero-telemetry-scrim pointer-events-auto px-3.5 py-2.5 sm:px-4.5 sm:py-3 flex flex-col gap-1.5 leading-relaxed whitespace-normal shadow-2xl border border-[#443A31]/80 backdrop-blur-md">
            {/* Top Bar with JPL source, coords, phase status, and Collapse / Expand toggle button */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] font-mono leading-snug text-[#E7E2DC]">
                <span className="uppercase tracking-wider text-[#FDBA74] font-semibold">
                  {neoSource === 'nasa_neows_live' ? 'NASA NeoWs Live' : 'JPL Ephemeris'}
                </span>
                <span aria-hidden="true" className="text-[#78716C]">·</span>
                <span className="text-[#FF6B00] font-bold tabular-nums">
                  {selectedLat.toFixed(2)}°N, {selectedLon.toFixed(2)}°E
                </span>
                <span aria-hidden="true" className="text-[#78716C]">·</span>
                <span className="text-[#7DD3FC] tabular-nums font-medium">
                  USGS {activeResult.terrain_elevation_m >= 0 ? '+' : ''}
                  {activeResult.terrain_elevation_m}m
                </span>
                <span aria-hidden="true" className="text-[#78716C]">·</span>
                <span className="text-[#38BDF8] font-semibold uppercase">
                  {simPhase === 'approaching'
                    ? 'Bolide Incoming...'
                    : simPhase === 'detonating'
                    ? activeResult.is_airburst
                      ? 'Atmospheric Airburst!'
                      : '3D Impact Detonation!'
                    : simPhase === 'complete'
                    ? activeResult.is_airburst
                      ? 'Airburst Complete'
                      : 'Crater Excavated'
                    : 'Target Locked'}
                </span>
              </div>

              {/* Minimize / Maximize Button */}
              <button
                type="button"
                onClick={() => setIsHudCollapsed(!isHudCollapsed)}
                aria-label={isHudCollapsed ? 'Expand Mission HUD' : 'Collapse Mission HUD'}
                title={isHudCollapsed ? 'Expand Mission HUD' : 'Collapse Mission HUD'}
                className="pointer-events-auto p-1 bg-[#141210] hover:bg-[#28211A] text-[#D6D3D1] hover:text-white border border-[#443A31] transition-colors cursor-pointer shrink-0"
              >
                {isHudCollapsed ? (
                  <Maximize2 className="w-3.5 h-3.5 text-[#FDBA74]" />
                ) : (
                  <Minimize2 className="w-3.5 h-3.5 text-[#D6D3D1]" />
                )}
              </button>
            </div>

            {/* Collapsed Mode: Clean compact summary */}
            {isHudCollapsed ? (
              <div className="flex items-center justify-between text-xs font-mono text-[#D6D3D1] pt-0.5">
                <span className="font-display font-bold text-white truncate">
                  {neos.find((n) => n.id === selectedNeoId)?.name || 'Custom Near-Earth Impactor'}
                </span>
                <span className="text-[#FDBA74] tabular-nums font-semibold shrink-0 ml-2">
                  {diameterM}m · {velocityKms} km/s · {activeResult.tnt_megatons < 1
                    ? `${formatLargeNumber(activeResult.tnt_kilotons)} KT`
                    : `${formatLargeNumber(activeResult.tnt_megatons)} MT`}
                </span>
              </div>
            ) : (
              /* Expanded Mode: Full Title, Shape & Energy, and Structured Stats Grid */
              <>
                <h1 className="text-base sm:text-lg font-display font-bold text-white tracking-tight leading-snug whitespace-normal">
                  {neos.find((n) => n.id === selectedNeoId)?.name || 'Custom Near-Earth Impactor'}
                </h1>

                <div className="text-[11px] sm:text-xs font-mono leading-snug text-[#D6D3D1] flex flex-wrap items-center gap-x-2 gap-y-1 whitespace-normal">
                  <span className="text-[#F5F0EB] font-medium">{morphologySpec.shapeLabel}</span>
                  <span aria-hidden="true" className="text-[#78716C]">·</span>
                  <span className="text-[#FDBA74] font-semibold tabular-nums">
                    {activeResult.tnt_megatons < 1
                      ? `${formatLargeNumber(activeResult.tnt_kilotons)} KT`
                      : `${formatLargeNumber(activeResult.tnt_megatons)} MT`}{' '}
                    TNT
                  </span>
                  <span aria-hidden="true" className="text-[#78716C]">·</span>
                  <span
                    className={
                      activeResult.is_airburst
                        ? 'text-[#38BDF8] font-semibold tabular-nums'
                        : 'text-[#F87171] font-semibold tabular-nums'
                    }
                  >
                    {activeResult.is_airburst
                      ? `Airburst @ ${activeResult.burst_altitude_km.toFixed(1)} km`
                      : activeResult.crater_ellipticity > 1.04
                      ? `Elliptical Crater ${activeResult.crater_Major_axis_km.toFixed(2)}×${activeResult.crater_minor_axis_km.toFixed(2)} km`
                      : `Crater ${activeResult.crater_km.toFixed(2)} km`}
                  </span>
                </div>

                {/* Target Zone & Firestorm Regime Line */}
                <div className="text-[11px] font-mono leading-snug text-[#D6D3D1] flex flex-wrap items-center gap-x-2 gap-y-0.5 pt-0.5">
                  <span className="text-[#A89F94] uppercase text-[10px] tracking-wider">Zone:</span>
                  <span className="text-[#F5F0EB] font-medium">{socio.region_label}</span>
                  <span aria-hidden="true" className="text-[#78716C]">·</span>
                  <span
                    className={
                      activeResult.firestorm_regime === 'global_firestorm_envelope'
                        ? 'text-[#EF4444] font-bold uppercase'
                        : activeResult.firestorm_regime === 'continental_firestorm'
                        ? 'text-[#FB923C] font-semibold uppercase'
                        : activeResult.firestorm_regime === 'local_thermal_ignition'
                        ? 'text-[#FDBA74] font-medium'
                        : 'text-[#38BDF8] font-medium'
                    }
                  >
                    {activeResult.firestorm_label}
                  </span>
                </div>

                {/* Structured 3-Card Socioeconomic Telemetry Grid (Zero squishing, generous breathing room) */}
                <div className="grid grid-cols-3 gap-1.5 pt-1.5 mt-0.5 border-t border-[#3A3128]/90 font-mono text-[11px]">
                  <div className="flex items-center gap-1.5 bg-[#12100E]/90 border border-[#2E2720] px-2 py-1.5 shadow-sm">
                    <Users className="w-3.5 h-3.5 text-[#FDBA74] shrink-0" />
                    <div className="min-w-0">
                      <span className="text-[#A89F94] block text-[9px] uppercase tracking-wider leading-none mb-0.5">
                        Displaced
                      </span>
                      <span className="text-white font-bold tabular-nums block truncate">
                        {formatLargeNumber(socio.displaced_population)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 bg-[#12100E]/90 border border-[#2E2720] px-2 py-1.5 shadow-sm">
                    <Skull className="w-3.5 h-3.5 text-[#F87171] shrink-0" />
                    <div className="min-w-0">
                      <span className="text-[#A89F94] block text-[9px] uppercase tracking-wider leading-none mb-0.5">
                        Casualties
                      </span>
                      <span className="text-white font-bold tabular-nums block truncate">
                        {formatLargeNumber(socio.estimated_casualties)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 bg-[#12100E]/90 border border-[#2E2720] px-2 py-1.5 shadow-sm">
                    <DollarSign className="w-3.5 h-3.5 text-[#38BDF8] shrink-0" />
                    <div className="min-w-0">
                      <span className="text-[#A89F94] block text-[9px] uppercase tracking-wider leading-none mb-0.5">
                        Infra Loss
                      </span>
                      <span className="text-[#7DD3FC] font-bold tabular-nums block truncate">
                        {socio.infrastructure_loss_formatted}
                      </span>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Professor & Planetary Defense Modal Overlay */}
        <ProfessorAcademyDrawer
          isOpen={isDrawerOpen}
          onClose={() => setIsDrawerOpen(false)}
          activeMode={drawerMode}
          onChangeMode={(m) => {
            setDrawerMode(m);
            if (m === 'deflection') setShowDeflectionArc(true);
          }}
          result={activeResult}
          deflectionParams={deflectionParams}
          onUpdateDeflection={(updates) =>
            setDeflectionParams((prev) => ({ ...prev, ...updates }))
          }
          deflectionResult={deflectionResult}
          showDeflectionArc={showDeflectionArc}
          onToggleDeflectionArc={setShowDeflectionArc}
        />

        {/* DECLUTTERED BOTTOM COMMAND DOCK (Clean Mode Tabs + Camera Controls + Parameter / Target / DART Strip) */}
        <section
          aria-label="Mission Telemetry and Simulation Controls"
          className="fixed bottom-0 inset-x-0 z-20 mx-auto max-w-6xl px-2 sm:px-3 pb-1.5 pointer-events-none"
        >
          {/* Single-Line Slim Bar: Mode Tabs + Camera Presets & Top-Right PiP Controls */}
          <div className="flex flex-wrap items-center justify-between gap-1.5 mb-1">
            {/* Mode Switcher */}
            <div className="flex items-center gap-0.5 bg-[#0E0C0A]/90 border border-[#3A3128] p-0.5 pointer-events-auto shrink-0">
              <button
                type="button"
                onClick={() => {
                  setIsDrawerOpen(false);
                  setActiveDockTab('parameters');
                  setIsDockCollapsed(false);
                }}
                className={`asteroid-chip px-2.5 py-0.5 text-[10px] font-mono uppercase tracking-wider transition-colors whitespace-nowrap cursor-pointer ${
                  !isDrawerOpen && activeDockTab === 'parameters' && !isDockCollapsed
                    ? 'bg-[#FF6B00] text-[#090807] font-bold'
                    : 'text-[#D6D3D1] hover:text-white'
                }`}
              >
                Parameters
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsDrawerOpen(false);
                  setActiveDockTab('targets');
                  setIsDockCollapsed(false);
                }}
                className={`asteroid-chip px-2.5 py-0.5 text-[10px] font-mono uppercase tracking-wider transition-colors whitespace-nowrap cursor-pointer tabular-nums ${
                  !isDrawerOpen && activeDockTab === 'targets' && !isDockCollapsed
                    ? 'bg-[#FF6B00] text-[#090807] font-bold'
                    : 'text-[#D6D3D1] hover:text-white'
                }`}
              >
                Targets ({selectedLat.toFixed(1)}°, {selectedLon.toFixed(1)}°)
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsDrawerOpen(false);
                  setActiveDockTab('dart');
                  setIsDockCollapsed(false);
                  setShowDeflectionArc(true);
                }}
                className={`asteroid-chip px-2.5 py-0.5 text-[10px] font-mono uppercase tracking-wider transition-colors whitespace-nowrap cursor-pointer ${
                  !isDrawerOpen && activeDockTab === 'dart' && !isDockCollapsed
                    ? 'bg-[#38BDF8] text-[#090807] font-bold'
                    : 'text-[#7DD3FC] hover:text-white'
                }`}
              >
                DART Defense
              </button>
              <button
                type="button"
                onClick={() => {
                  setDrawerMode('academy');
                  setIsDrawerOpen(true);
                }}
                className={`asteroid-chip px-2.5 py-0.5 text-[10px] font-mono uppercase tracking-wider transition-colors whitespace-nowrap cursor-pointer ${
                  isDrawerOpen && drawerMode === 'academy'
                    ? 'bg-[#FF6B00] text-[#090807] font-bold'
                    : 'text-[#FDBA74] hover:text-white'
                }`}
              >
                Physics Briefing
              </button>
            </div>

            {/* Camera, Top-Right 3D Entry PiP Toggle & Dock Controls */}
            <div className="flex items-center gap-1 pointer-events-auto shrink-0">
              <div className="hidden sm:flex items-center gap-0.5 bg-[#0E0C0A]/90 border border-[#3A3128] p-0.5">
                <Camera className="w-3 h-3 text-[#D6D3D1] mx-1 shrink-0" />
                {(
                  [
                    { id: 'orbital', label: 'Orbital' },
                    { id: 'asteroid', label: 'Asteroid' },
                    { id: 'horizon', label: 'Horizon' },
                    { id: 'moon', label: 'Lunar' },
                  ] as const
                ).map((cam) => (
                  <button
                    key={cam.id}
                    type="button"
                    onClick={() => {
                      soundEngine.playTick(620);
                      setCameraPreset(cam.id);
                    }}
                    className={`asteroid-chip px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider transition-colors cursor-pointer whitespace-nowrap ${
                      cameraPreset === cam.id
                        ? 'bg-[#2B180C] text-[#FDBA74] border border-[#FF6B00]'
                        : 'text-[#D6D3D1] hover:text-white'
                    }`}
                  >
                    {cam.label}
                  </button>
                ))}
              </div>

              {/* Compact Top-Right 2D USGS Topographic Crater Cross-Section Toggle */}
              <button
                type="button"
                title="Toggle Top-Right 2D USGS Topographic Crater Cross-Section"
                onClick={() => {
                  soundEngine.playTick(580);
                  setSplitCamMode((prev) => (prev === 'pinned' ? 'hidden' : 'pinned'));
                }}
                className={`asteroid-btn flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider border transition-colors cursor-pointer whitespace-nowrap ${
                  splitCamMode === 'pinned'
                    ? 'bg-[#2B180C] text-[#FDBA74] border-[#FF6B00] font-bold'
                    : 'bg-[#0E0C0A]/90 text-[#A89F94] border-[#3A3128] hover:border-[#38BDF8]'
                }`}
              >
                <Columns className="w-3 h-3 shrink-0" />
                <span>{splitCamMode === 'pinned' ? '2D Topo: On' : '2D Topo: Off'}</span>
              </button>

              <button
                type="button"
                onClick={handleToggleAudio}
                aria-label={isAudioMuted ? 'Unmute Observatory Audio' : 'Mute Observatory Audio'}
                className="asteroid-btn p-1 text-xs font-mono text-[#E7E2DC] bg-[#0E0C0A]/90 border border-[#3A3128] hover:border-[#FF6B00] transition-colors cursor-pointer"
              >
                {isAudioMuted ? (
                  <VolumeX className="w-3.5 h-3.5 text-[#A89F94]" />
                ) : (
                  <Volume2 className="w-3.5 h-3.5 text-[#FF6B00]" />
                )}
              </button>

              <button
                type="button"
                onClick={() => setIsDockCollapsed(!isDockCollapsed)}
                className="asteroid-btn flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono text-[#E7E2DC] bg-[#0E0C0A]/90 border border-[#3A3128] hover:border-[#FF6B00] transition-colors cursor-pointer whitespace-nowrap"
              >
                {isDockCollapsed ? (
                  <>
                    <ChevronUp className="w-3 h-3 text-[#FF6B00]" />
                    <span>Show</span>
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-3 h-3 text-[#D6D3D1]" />
                    <span>Hide</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Single Compact Control Strip (~64px tall!) */}
          {!isDockCollapsed && !isDrawerOpen && (
            <div className="asteroid-panel pointer-events-auto px-2.5 py-1.5">
              {activeDockTab === 'parameters' ? (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-2 items-center">
                  {/* Col 1-5: NEO Selector + Variable Composition Presets with Grouped Optgroups */}
                  <div className="lg:col-span-5 flex flex-col gap-1.5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      <select
                        id="neo-select"
                        aria-label="Near-Earth Object (NASA NeoWs / CNEOS)"
                        value={selectedNeoId}
                        onChange={(e) => handleSelectNeo(e.target.value)}
                        className="w-full bg-[#141210] hover:bg-[#1E1A16] border border-[#443A31] focus:border-[#FF6B00] px-2 py-1.5 text-xs font-medium text-[#F5F0EB] focus:outline-none transition-colors cursor-pointer"
                      >
                        <optgroup label="Planetary Defense & Watch Targets" className="bg-[#141210] text-[#7DD3FC] font-semibold">
                          {neos
                            .filter(
                              (neo) =>
                                neo.id === 'impactor-2025' ||
                                neo.id.includes('didymos') ||
                                neo.id.includes('apophis') ||
                                neo.id.includes('bennu') ||
                                neo.id.includes('2024-yr4')
                            )
                            .map((neo) => (
                              <option key={neo.id} value={neo.id} className="text-[#F5F0EB] font-normal">
                                {neo.name} (~{Math.round(neo.est_diameter_m_avg)}m @ {neo.est_velocity_km_s} km/s)
                              </option>
                            ))}
                        </optgroup>

                        <optgroup label="Historical & Reference Bolides" className="bg-[#141210] text-[#FDBA74] font-semibold">
                          {neos
                            .filter(
                              (neo) =>
                                neo.id.includes('chelyabinsk') ||
                                neo.id.includes('2008-tc3') ||
                                neo.id.includes('campo-del-cielo')
                            )
                            .map((neo) => (
                              <option key={neo.id} value={neo.id} className="text-[#F5F0EB] font-normal">
                                {neo.name} (~{Math.round(neo.est_diameter_m_avg)}m @ {neo.est_velocity_km_s} km/s)
                              </option>
                            ))}
                        </optgroup>

                        <optgroup label="Planetary Extinction Scale" className="bg-[#141210] text-[#FCA5A5] font-semibold">
                          {neos
                            .filter((neo) => neo.id.includes('chicxulub'))
                            .map((neo) => (
                              <option key={neo.id} value={neo.id} className="text-[#F5F0EB] font-normal">
                                {neo.name} (~{Math.round(neo.est_diameter_m_avg)}m @ {neo.est_velocity_km_s} km/s)
                              </option>
                            ))}
                        </optgroup>

                        {/* Any other dynamically fetched live NEOs */}
                        {neos.some(
                          (neo) =>
                            !neo.id.includes('impactor') &&
                            !neo.id.includes('didymos') &&
                            !neo.id.includes('apophis') &&
                            !neo.id.includes('bennu') &&
                            !neo.id.includes('2024-yr4') &&
                            !neo.id.includes('chelyabinsk') &&
                            !neo.id.includes('2008-tc3') &&
                            !neo.id.includes('campo') &&
                            !neo.id.includes('chicxulub')
                        ) && (
                          <optgroup label="NASA NeoWs Live Discoveries" className="bg-[#141210] text-[#34D399] font-semibold">
                            {neos
                              .filter(
                                (neo) =>
                                  !neo.id.includes('impactor') &&
                                  !neo.id.includes('didymos') &&
                                  !neo.id.includes('apophis') &&
                                  !neo.id.includes('bennu') &&
                                  !neo.id.includes('2024-yr4') &&
                                  !neo.id.includes('chelyabinsk') &&
                                  !neo.id.includes('2008-tc3') &&
                                  !neo.id.includes('campo') &&
                                  !neo.id.includes('chicxulub')
                              )
                              .map((neo) => (
                                <option key={neo.id} value={neo.id} className="text-[#F5F0EB] font-normal">
                                  {neo.name} (~{Math.round(neo.est_diameter_m_avg)}m @ {neo.est_velocity_km_s} km/s)
                                </option>
                              ))}
                          </optgroup>
                        )}
                      </select>

                      <select
                        id="composition-preset-select"
                        aria-label="Variable Asteroid Composition Preset"
                        value={composition}
                        onChange={(e) => {
                          soundEngine.playTick(480);
                          setComposition(e.target.value as CompositionType);
                          setResetTrigger((r) => r + 1);
                        }}
                        className="w-full bg-[#141210] hover:bg-[#1E1A16] border border-[#443A31] focus:border-[#FF6B00] px-2 py-1.5 text-xs font-mono text-[#FDBA74] focus:outline-none transition-colors cursor-pointer"
                      >
                        <optgroup label="Asteroid Composition Models" className="bg-[#141210] text-[#A89F94] font-semibold">
                          <option value="ice" className="text-[#E7E2DC]">67P Cometary Ice (600 kg/m³)</option>
                          <option value="porous_rock" className="text-[#E7E2DC]">101955 Bennu Rubble-Pile (1,500 kg/m³)</option>
                          <option value="stony" className="text-[#E7E2DC]">Chelyabinsk LL5 Stony (3,300 kg/m³)</option>
                          <option value="iron" className="text-[#E7E2DC]">Campo del Cielo Iron Core (7,800 kg/m³)</option>
                        </optgroup>
                      </select>
                    </div>

                    <div className="grid grid-cols-4 gap-1">
                      {(
                        [
                          { id: 'ice', label: 'Ice 0.6g', Icon: Snowflake },
                          { id: 'porous_rock', label: 'Bennu 1.5g', Icon: Layers },
                          { id: 'stony', label: 'Stony 3.3g', Icon: Hexagon },
                          { id: 'iron', label: 'Campo 7.8g', Icon: Shield },
                        ] as const
                      ).map(({ id, label, Icon }) => {
                        const active = composition === id;
                        return (
                          <button
                            key={id}
                            type="button"
                            onClick={() => {
                              soundEngine.playTick(480);
                              setComposition(id);
                              setResetTrigger((r) => r + 1);
                            }}
                            className={`asteroid-chip py-1 px-1.5 flex items-center justify-center gap-1 border text-[10px] font-mono transition-all cursor-pointer ${
                              active
                                ? 'bg-[#2B180C] border-[#FF6B00] text-[#FDBA74] font-bold'
                                : 'bg-[#12100E] border-[#362E26] text-[#D6D3D1] hover:border-[#FF6B00]/60'
                            }`}
                          >
                            <Icon
                              className={`w-3 h-3 shrink-0 ${
                                active ? 'text-[#FF6B00]' : 'text-[#A89F94]'
                              }`}
                            />
                            <span className="truncate">{label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Col 6-10: 3 Compact Sliders with Direct Numeric Inputs & Tick Marks */}
                  <div className="lg:col-span-5 grid grid-cols-3 gap-2">
                    {/* Diameter */}
                    <div className="asteroid-card px-2.5 py-1.5">
                      <div className="flex justify-between items-center gap-1">
                        <span className="flex items-center gap-1 text-[11px] text-[#E7E2DC] font-semibold">
                          <Maximize2 className="w-3 h-3 text-[#FF6B00]" />
                          <span>Size</span>
                        </span>
                        <div className="flex items-center gap-0.5 bg-[#090807] border border-[#443A31] px-1">
                          <input
                            type="number"
                            aria-label="Diameter in meters"
                            min={5}
                            max={15000}
                            value={diameterM}
                            onChange={(e) => {
                              setDiameterM(
                                Math.max(5, Math.min(15000, Number(e.target.value) || 5))
                              );
                              setResetTrigger((r) => r + 1);
                            }}
                            className="w-12 bg-transparent text-right font-mono tabular-nums text-[11px] text-[#FF6B00] font-bold focus:outline-none"
                          />
                          <span className="text-[9px] font-mono text-[#A89F94]">m</span>
                        </div>
                      </div>
                      <input
                        type="range"
                        aria-label="Diameter Slider"
                        min={5}
                        max={10000}
                        step={5}
                        value={Math.min(10000, diameterM)}
                        onChange={(e) => {
                          setDiameterM(Number(e.target.value));
                          setResetTrigger((r) => r + 1);
                        }}
                        className="w-full"
                      />
                      <div className="flex justify-between text-[9px] font-mono tabular-nums text-[#A89F94]">
                        <span>5m</span>
                        <span>5km</span>
                        <span>10km</span>
                      </div>
                    </div>

                    {/* Velocity */}
                    <div className="asteroid-card px-2.5 py-1.5">
                      <div className="flex justify-between items-center gap-1">
                        <span className="flex items-center gap-1 text-[11px] text-[#E7E2DC] font-semibold">
                          <Zap className="w-3 h-3 text-[#FDBA74]" />
                          <span>Speed</span>
                        </span>
                        <div className="flex items-center gap-0.5 bg-[#090807] border border-[#443A31] px-1">
                          <input
                            type="number"
                            aria-label="Velocity in km/s"
                            min={11}
                            max={72}
                            step={0.5}
                            value={velocityKms}
                            onChange={(e) => {
                              setVelocityKms(
                                Math.max(11, Math.min(72, Number(e.target.value) || 11))
                              );
                              setResetTrigger((r) => r + 1);
                            }}
                            className="w-10 bg-transparent text-right font-mono tabular-nums text-[11px] text-[#FDBA74] font-bold focus:outline-none"
                          />
                          <span className="text-[9px] font-mono text-[#A89F94]">km/s</span>
                        </div>
                      </div>
                      <input
                        type="range"
                        aria-label="Velocity Slider"
                        min={11}
                        max={72}
                        step={0.5}
                        value={velocityKms}
                        onChange={(e) => {
                          setVelocityKms(Number(e.target.value));
                          setResetTrigger((r) => r + 1);
                        }}
                        className="w-full"
                      />
                      <div className="flex justify-between text-[9px] font-mono tabular-nums text-[#A89F94]">
                        <span>11</span>
                        <span>40</span>
                        <span>72 km/s</span>
                      </div>
                    </div>

                    {/* Angle */}
                    <div className="asteroid-card px-2.5 py-1.5">
                      <div className="flex justify-between items-center gap-1">
                        <span className="flex items-center gap-1 text-[11px] text-[#E7E2DC] font-semibold">
                          <Compass className="w-3 h-3 text-[#38BDF8]" />
                          <span>Angle</span>
                        </span>
                        <div className="flex items-center gap-0.5 bg-[#090807] border border-[#443A31] px-1">
                          <input
                            type="number"
                            aria-label="Entry Angle in degrees"
                            min={10}
                            max={90}
                            step={1}
                            value={angleDeg}
                            onChange={(e) => {
                              setAngleDeg(
                                Math.max(10, Math.min(90, Number(e.target.value) || 45))
                              );
                              setResetTrigger((r) => r + 1);
                            }}
                            className="w-8 bg-transparent text-right font-mono tabular-nums text-[11px] text-[#38BDF8] font-bold focus:outline-none"
                          />
                          <span className="text-[9px] font-mono text-[#A89F94]">°</span>
                        </div>
                      </div>
                      <input
                        type="range"
                        aria-label="Entry Angle Slider"
                        min={10}
                        max={90}
                        step={1}
                        value={angleDeg}
                        onChange={(e) => {
                          setAngleDeg(Number(e.target.value));
                          setResetTrigger((r) => r + 1);
                        }}
                        className="w-full"
                      />
                      <div className="flex justify-between text-[9px] font-mono tabular-nums text-[#A89F94]">
                        <span>10°</span>
                        <span>45°</span>
                        <span>90°</span>
                      </div>
                    </div>
                  </div>

                  {/* Col 11-12: Prominent Destructive Launch Button + Icon-Only Center & Reset */}
                  <div className="lg:col-span-2 flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleTriggerSimulation}
                      className="asteroid-btn flex-1 py-2.5 px-2.5 bg-gradient-to-r from-[#EA580C] via-[#DC2626] to-[#EA580C] hover:brightness-110 text-white font-mono font-bold uppercase tracking-wider text-xs flex items-center justify-center gap-1.5 border border-[#FDBA74] shadow-[0_0_20px_rgba(234,88,12,0.55)] transition-all cursor-pointer"
                    >
                      <Flame className="w-3.5 h-3.5 fill-current shrink-0" />
                      <span>Launch</span>
                    </button>

                    <button
                      type="button"
                      title="Center Camera on Target Coordinates"
                      aria-label="Center Globe"
                      onClick={() => {
                        soundEngine.playTick(500);
                        setCameraPreset('orbital');
                        setCenterTrigger((c) => c + 1);
                      }}
                      className="asteroid-btn p-2.5 bg-[#141210] hover:bg-[#221E1A] text-[#D6D3D1] hover:text-white border border-[#3A3128] hover:border-[#FF6B00] transition-colors cursor-pointer"
                    >
                      <Crosshair className="w-3.5 h-3.5 text-[#FF6B00]" />
                    </button>

                    <button
                      type="button"
                      title="Reset Parameters & Restore Un-Cratered Earth"
                      aria-label="Reset Defaults"
                      onClick={handleResetDefaults}
                      className="asteroid-btn p-2.5 bg-[#141210] hover:bg-[#221E1A] text-[#D6D3D1] hover:text-white border border-[#3A3128] hover:border-[#38BDF8] transition-colors cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-[#38BDF8]" />
                    </button>
                  </div>
                </div>
              ) : activeDockTab === 'targets' ? (
                /* TARGET COORDINATES TAB (7-Card Array with Pin Icons & Visual Separation) */
                <div className="bg-[#0A0807] border border-[#2B241E] p-1.5 shadow-inner">
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-1.5">
                    {TARGET_PRESETS.map((preset) => {
                      const isSelected =
                        Math.abs(selectedLat - preset.lat) < 0.5 &&
                        Math.abs(selectedLon - preset.lon) < 0.5;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => {
                            handleSelectLocation(
                              preset.lat,
                              preset.lon,
                              preset.name,
                              preset.targetDensityKgM3
                            );
                            setCenterTrigger((c) => c + 1);
                          }}
                          className={`asteroid-card text-left px-2.5 py-1.5 border transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-[#2B180C] border-[#FF6B00] text-white shadow-[0_0_12px_rgba(255,107,0,0.35)]'
                              : 'bg-[#12100E] border-[#362E26] text-[#D6D3D1] hover:border-[#FF6B00]/70 hover:bg-[#1A1613]'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            <MapPin
                              className={`w-3.5 h-3.5 shrink-0 ${
                                isSelected ? 'text-[#FF6B00]' : 'text-[#A89F94]'
                              }`}
                            />
                            <div className="text-[11px] font-semibold truncate text-[#F5F0EB]">
                              {preset.name}
                            </div>
                          </div>
                          <div className="flex items-center justify-between text-[10px] font-mono tabular-nums text-[#FDBA74] mt-0.5 pl-5">
                            <span>
                              {preset.lat.toFixed(1)}°, {preset.lon.toFixed(1)}°
                            </span>
                            <span className="text-[9px] uppercase tracking-wider text-[#A89F94]">
                              {preset.targetDensityKgM3 <= 1500 ? 'Ocean' : 'Land'}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                /* INLINE DART KINETIC IMPACTOR INTERCEPTION STRIP (Watch 3D Deflected Orbit Arc Live!) */
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-2 items-center">
                  {/* Slider 1: Warning Lead Time (Years in advance) */}
                  <div className="lg:col-span-3 asteroid-card px-2.5 py-1.5">
                    <div className="flex justify-between items-center text-[11px]">
                      <span className="text-[#E7E2DC] font-semibold">Lead Time</span>
                      <span className="font-mono text-[#38BDF8] font-bold tabular-nums">
                        {deflectionParams.warning_years.toFixed(1)} yrs
                      </span>
                    </div>
                    <input
                      type="range"
                      aria-label="DART Warning Lead Time in Years"
                      min={0.5}
                      max={25}
                      step={0.5}
                      value={deflectionParams.warning_years}
                      onChange={(e) => {
                        setShowDeflectionArc(true);
                        setDeflectionParams((prev) => ({
                          ...prev,
                          warning_years: Number(e.target.value),
                        }));
                      }}
                      className="w-full"
                    />
                    <div className="flex justify-between text-[9px] font-mono text-[#A89F94]">
                      <span>0.5 yr</span>
                      <span>12 yrs</span>
                      <span>25 yrs</span>
                    </div>
                  </div>

                  {/* Slider 2: Kinetic Impactor Mass */}
                  <div className="lg:col-span-3 asteroid-card px-2.5 py-1.5">
                    <div className="flex justify-between items-center text-[11px]">
                      <span className="text-[#E7E2DC] font-semibold">Impactor Mass</span>
                      <span className="font-mono text-[#FDBA74] font-bold tabular-nums">
                        {deflectionParams.impactor_mass_kg.toLocaleString()} kg
                      </span>
                    </div>
                    <input
                      type="range"
                      aria-label="DART Impactor Spacecraft Mass in kg"
                      min={500}
                      max={20000}
                      step={250}
                      value={deflectionParams.impactor_mass_kg}
                      onChange={(e) => {
                        setShowDeflectionArc(true);
                        setDeflectionParams((prev) => ({
                          ...prev,
                          impactor_mass_kg: Number(e.target.value),
                        }));
                      }}
                      className="w-full"
                    />
                    <div className="flex justify-between text-[9px] font-mono text-[#A89F94]">
                      <span>500 kg</span>
                      <span>10t</span>
                      <span>20t</span>
                    </div>
                  </div>

                  {/* Slider 3: Momentum Enhancement Factor Beta */}
                  <div className="lg:col-span-2 asteroid-card px-2.5 py-1.5">
                    <div className="flex justify-between items-center text-[11px]">
                      <span className="text-[#E7E2DC] font-semibold">Momentum β</span>
                      <span className="font-mono text-[#10B981] font-bold tabular-nums">
                        {deflectionParams.beta_factor.toFixed(1)}×
                      </span>
                    </div>
                    <input
                      type="range"
                      aria-label="Momentum Enhancement Factor Beta"
                      min={1.0}
                      max={6.0}
                      step={0.1}
                      value={deflectionParams.beta_factor}
                      onChange={(e) => {
                        setShowDeflectionArc(true);
                        setDeflectionParams((prev) => ({
                          ...prev,
                          beta_factor: Number(e.target.value),
                        }));
                      }}
                      className="w-full"
                    />
                    <div className="flex justify-between text-[9px] font-mono text-[#A89F94]">
                      <span>1.0</span>
                      <span>3.6 (DART)</span>
                      <span>6.0</span>
                    </div>
                  </div>

                  {/* Live Δv & B-Plane Miss Clearance Readout + Full Briefing Button */}
                  <div className="lg:col-span-4 flex items-center justify-between gap-2 bg-[#090807] border border-[#2E2720] px-2.5 py-1.5">
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex items-center gap-1.5 text-[10px] font-mono">
                        <span className="text-[#A89F94]">Δv:</span>
                        <strong className="text-[#38BDF8] tabular-nums">
                          {deflectionResult.delta_v_mm_s.toFixed(2)} mm/s
                        </strong>
                        <span className="text-[#443A31]">|</span>
                        <span className="text-[#A89F94]">Miss:</span>
                        <strong className="text-[#10B981] tabular-nums">
                          {deflectionResult.earth_radii_clearance.toFixed(2)} R<sub>E</sub>
                        </strong>
                      </div>
                      <div className="flex items-center gap-1.5 text-[9px] font-mono">
                        <span
                          className={`px-1.5 py-0.2 font-bold uppercase ${
                            deflectionResult.status === 'DEFLECTED'
                              ? 'bg-[#064E3B] text-[#6EE7B7]'
                              : deflectionResult.status === 'GRAZING_RISK'
                              ? 'bg-[#451A03] text-[#FDBA74]'
                              : 'bg-[#450A0A] text-[#FCA5A5]'
                          }`}
                        >
                          {deflectionResult.status.replace('_', ' ')}
                        </span>
                        <span className="text-[#A89F94] truncate">
                          Drift {formatLargeNumber(deflectionResult.deflected_distance_km)} km
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setDrawerMode('deflection');
                        setIsDrawerOpen(true);
                        setShowDeflectionArc(true);
                      }}
                      className="asteroid-btn px-2.5 py-1.5 bg-[#0E2433] hover:bg-[#16344A] text-[#7DD3FC] border border-[#38BDF8] text-[10px] font-mono font-bold uppercase tracking-wider cursor-pointer shrink-0"
                    >
                      Full Lab
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
