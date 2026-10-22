import React, { useState, useEffect } from 'react';
import {
  ImpactSimulationResult,
  DeflectionParameters,
  DeflectionResult,
} from '../types';
import {
  COMPOSITIONS,
  HISTORICAL_BENCHMARKS,
  formatLargeNumber,
} from '../utils/impactPhysics';
import { X, Compass, Shield, BookOpen, CheckCircle2, AlertTriangle, Rocket, Play, RefreshCw, Sparkles } from 'lucide-react';

interface ProfessorAcademyDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  activeMode: 'academy' | 'deflection';
  onChangeMode: (mode: 'academy' | 'deflection') => void;
  result: ImpactSimulationResult;
  deflectionParams: DeflectionParameters;
  onUpdateDeflection: (updates: Partial<DeflectionParameters>) => void;
  deflectionResult: DeflectionResult;
  showDeflectionArc: boolean;
  onToggleDeflectionArc: (show: boolean) => void;
}

export const ProfessorAcademyDrawer: React.FC<ProfessorAcademyDrawerProps> = ({
  isOpen,
  onClose,
  activeMode,
  onChangeMode,
  result,
  deflectionParams,
  onUpdateDeflection,
  deflectionResult,
  showDeflectionArc,
  onToggleDeflectionArc,
}) => {
  const [hasExecutedDart, setHasExecutedDart] = useState<boolean>(true);
  const [isExecutingDart, setIsExecutingDart] = useState<boolean>(false);

  // When sliders change, flag that the simulation state has new pending parameters
  useEffect(() => {
    setHasExecutedDart(false);
  }, [
    deflectionParams.warning_years,
    deflectionParams.impactor_mass_kg,
    deflectionParams.beta_factor,
    deflectionParams.method,
  ]);

  if (!isOpen) return null;

  const compInfo = COMPOSITIONS[result.composition];

  const handleRunDartImpact = () => {
    setIsExecutingDart(true);
    onToggleDeflectionArc(true);
    setTimeout(() => {
      setIsExecutingDart(false);
      setHasExecutedDart(true);
    }, 280);
  };

  return (
    <div
      role="dialog"
      aria-label="Planetary Defense & Professor Physics Observatory"
      className="fixed inset-x-0 top-16 bottom-16 z-30 mx-auto max-w-5xl px-4 pointer-events-none flex items-center justify-center"
    >
      <div className="asteroid-panel pointer-events-auto w-full max-h-full flex flex-col overflow-hidden shadow-2xl">
        {/* Drawer Header — Sharp Asteroid Cut */}
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-3.5 bg-[#0C0A09] border-b border-[#2E2720] shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onChangeMode('academy')}
              className={`asteroid-btn flex items-center gap-2 px-3.5 py-1.5 text-xs font-mono uppercase tracking-wider transition-colors cursor-pointer ${
                activeMode === 'academy'
                  ? 'bg-[#EA580C] text-[#090807] font-bold'
                  : 'bg-[#161310] text-[#D6D3D1] hover:text-white border border-[#2E2720]'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Professor & Physics Briefing</span>
            </button>
            <button
              type="button"
              onClick={() => onChangeMode('deflection')}
              className={`asteroid-btn flex items-center gap-2 px-3.5 py-1.5 text-xs font-mono uppercase tracking-wider transition-colors cursor-pointer ${
                activeMode === 'deflection'
                  ? 'bg-[#38BDF8] text-[#090807] font-bold'
                  : 'bg-[#161310] text-[#D6D3D1] hover:text-white border border-[#2E2720]'
              }`}
            >
              <Shield className="w-3.5 h-3.5" />
              <span>Planetary Defense (DART Sandbox)</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close Observatory Briefing"
            className="asteroid-btn flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono uppercase tracking-wider text-[#D6D3D1] hover:text-white bg-[#161310] hover:bg-[#241F1A] border border-[#362E26] transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
            <span>Return to 3D Globe</span>
          </button>
        </div>

        {/* Drawer Body */}
        <div className="p-5 overflow-y-auto space-y-5 text-[#F5F0EB]">
          {activeMode === 'academy' ? (
            <>
              {/* Hero Academic Summary Banner */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2 asteroid-card p-4 space-y-2.5">
                  <div className="text-[11px] font-mono uppercase tracking-widest text-[#F97316] font-semibold">
                    Collins, Melosh & Marcus (2005) · Pi-Group Scaling Derivation
                  </div>
                  <h2 className="text-xl sm:text-2xl font-display font-bold text-white tracking-tight">
                    Physical Mechanics of {result.diameter_m}m {compInfo.name} Impact
                  </h2>
                  <p className="text-sm sm:text-[15px] text-[#E7E2DC] leading-relaxed font-sans">
                    {result.notes}
                  </p>
                </div>

                {/* Live Comparative Energy Card */}
                <div className="asteroid-card p-4 flex flex-col justify-between">
                  <div>
                    <div className="text-[11px] font-mono uppercase tracking-wider text-[#D6D3D1] font-medium">
                      Energetic Equivalents
                    </div>
                    <div className="mt-1 text-2xl font-mono font-bold text-[#F97316]">
                      {formatLargeNumber(result.tnt_megatons)} MT
                    </div>
                    <div className="text-xs font-mono text-[#D6D3D1] mt-0.5">
                      {result.energy_j.toExponential(2)} Joules
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-[#2E2720] space-y-1.5 text-xs font-mono">
                    <div className="flex justify-between">
                      <span className="text-[#D6D3D1]">Hiroshima (15 kT):</span>
                      <span className="text-white font-semibold">
                        {formatLargeNumber(result.hiroshima_multiples)}×
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#D6D3D1]">Tsar Bomba (50 MT):</span>
                      <span className="text-white font-semibold">
                        {result.tsar_bomba_multiples.toFixed(2)}×
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 4 Step-by-Step Mathematical Derivations with Live Plugged-in Numbers */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Equation 1: Mass & Kinetic Energy */}
                <div className="asteroid-card p-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono uppercase tracking-wider text-[#F97316] font-bold">
                      01 · Spherical Mass & Kinetic Energy
                    </span>
                    <span className="text-xs font-mono text-[#D6D3D1]">
                      ρ = {result.density_kg_m3} kg/m³
                    </span>
                  </div>
                  <div className="bg-[#090807] border border-[#2B251F] p-3 font-mono text-xs sm:text-[13px] text-white space-y-1.5">
                    <div>m = (4/3) · π · r³ · ρ = {result.mass_kg.toExponential(3)} kg</div>
                    <div className="text-[#FDBA74] font-semibold">
                      E_k = ½ · m · v² = {result.energy_j.toExponential(3)} J
                    </div>
                  </div>
                  <p className="text-xs sm:text-[13px] text-[#E7E2DC] leading-relaxed">
                    Kinetic energy scales linearly with mass (cubed with diameter) and quadratically
                    with entry velocity ({result.velocity_km_s} km/s).
                  </p>
                </div>

                {/* Equation 2: Atmospheric Ram Pressure & Airburst */}
                <div className="asteroid-card p-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono uppercase tracking-wider text-[#38BDF8] font-bold">
                      02 · Aerodynamic Ram Pressure Breakup
                    </span>
                    <span className="text-xs font-mono text-[#D6D3D1]">
                      Y_s ≈ {compInfo.strengthMPa.toFixed(1)} MPa
                    </span>
                  </div>
                  <div className="bg-[#090807] border border-[#2B251F] p-3 font-mono text-xs sm:text-[13px] text-white space-y-1.5">
                    <div>P_ram(z) = ρ_air(z) · v² ≥ Y_yield</div>
                    <div className="text-[#7DD3FC] font-semibold">
                      {result.is_airburst
                        ? `Airburst Detonation at ${result.burst_altitude_km.toFixed(1)} km altitude`
                        : `Intact Hypervelocity Ground Impact (Breakup < Surface)`}
                    </div>
                  </div>
                  <p className="text-xs sm:text-[13px] text-[#E7E2DC] leading-relaxed">
                    Pancake fragmentation occurs when stagnation ram pressure exceeds the bolide&apos;s
                    internal tensile strength ({compInfo.description}).
                  </p>
                </div>

                {/* Equation 3: Pi-Group Crater Excavation */}
                <div className="asteroid-card p-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono uppercase tracking-wider text-[#EF4444] font-bold">
                      03 · Pi-Group Crater Excavation Scaling
                    </span>
                    <span className="text-xs font-mono text-[#D6D3D1]">
                      θ = {result.angle_deg}°
                    </span>
                  </div>
                  <div className="bg-[#090807] border border-[#2B251F] p-3 font-mono text-xs sm:text-[13px] text-white space-y-1.5">
                    <div>
                      D_tc = 1.161 · (ρ_i / ρ_t)^(1/3) · L^0.78 · v^0.44 · g^-0.22 · sin^(1/3)(θ)
                    </div>
                    <div className="text-[#FCA5A5] font-semibold">
                      {result.is_airburst
                        ? `Airburst @ ${result.burst_altitude_km.toFixed(1)} km (0.00 km Ground Crater)`
                        : `Elliptical Crater: ${result.crater_Major_axis_km.toFixed(2)} × ${result.crater_minor_axis_km.toFixed(2)} km (Depth: ${result.crater_depth_km.toFixed(2)} km, Rim: +${result.rim_height_m}m)`}
                    </div>
                  </div>
                  <p className="text-xs sm:text-[13px] text-[#E7E2DC] leading-relaxed">
                    Oblique impacts (θ = {result.angle_deg}°) produce an ellipticity of{' '}
                    {result.crater_ellipticity.toFixed(2)} and asymmetrical downrange ejecta
                    blankets extending {result.downrange_ejecta_reach_km.toFixed(1)} km.
                  </p>
                </div>

                {/* Equation 4: Seismic & Overpressure Scaling */}
                <div className="asteroid-card p-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono uppercase tracking-wider text-[#10B981] font-bold">
                      04 · Seismic Coupling & Airblast Radius
                    </span>
                    <span className="text-xs font-mono text-[#D6D3D1]">η_s ≈ 10⁻⁴</span>
                  </div>
                  <div className="bg-[#090807] border border-[#2B251F] p-3 font-mono text-xs sm:text-[13px] text-white space-y-1.5">
                    <div>M_w = 0.67 · log₁₀(E_J) - 5.87 = {result.equivalent_earthquake_Mw.toFixed(2)}</div>
                    <div className="text-[#6EE7B7] font-semibold">
                      20 psi Severe: {result.severe_blast_km.toFixed(1)} km · 1 psi Window:{' '}
                      {result.blast_km.toFixed(1)} km
                    </div>
                  </div>
                  <p className="text-xs sm:text-[13px] text-[#E7E2DC] leading-relaxed">
                    Approximately 0.01% of kinetic impact energy couples into global Rayleigh and P/S
                    crustal seismic waves.
                  </p>
                </div>
              </div>

              {/* Socioeconomic Population Density & Regional GDP Infrastructure Loss Grid */}
              <div className="asteroid-card p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-mono uppercase tracking-wider text-[#38BDF8] font-bold">
                    05 · Socioeconomic & USGS Elevation Exposure ({result.socioeconomic.region_label})
                  </span>
                  <span className="text-xs font-mono text-[#D6D3D1]">
                    USGS Datum: {result.terrain_elevation_m >= 0 ? '+' : ''}
                    {result.terrain_elevation_m}m · Pop Density:{' '}
                    {result.socioeconomic.population_density_km2} /km²
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono">
                  <div className="bg-[#090807] border border-[#2B251F] p-3">
                    <div className="text-[10px] uppercase text-[#D6D3D1] font-medium">Displaced People</div>
                    <div className="text-base font-bold text-[#FDBA74] mt-0.5 tabular-nums">
                      {formatLargeNumber(result.socioeconomic.displaced_population)}
                    </div>
                  </div>
                  <div className="bg-[#090807] border border-[#2B251F] p-3">
                    <div className="text-[10px] uppercase text-[#D6D3D1] font-medium">Est. Casualties</div>
                    <div className="text-base font-bold text-[#EF4444] mt-0.5 tabular-nums">
                      {formatLargeNumber(result.socioeconomic.estimated_casualties)}
                    </div>
                  </div>
                  <div className="bg-[#090807] border border-[#2B251F] p-3">
                    <div className="text-[10px] uppercase text-[#D6D3D1] font-medium">Infrastructure Loss</div>
                    <div className="text-base font-bold text-[#38BDF8] mt-0.5 tabular-nums">
                      {result.socioeconomic.infrastructure_loss_formatted}
                    </div>
                  </div>
                  <div className="bg-[#090807] border border-[#2B251F] p-3">
                    <div className="text-[10px] uppercase text-[#D6D3D1] font-medium">Regional GDP/Capita</div>
                    <div className="text-base font-bold text-[#10B981] mt-0.5 tabular-nums">
                      ${result.socioeconomic.regional_gdp_per_capita_usd.toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>

              {/* Historical Impact Benchmarks Table */}
              <div className="asteroid-card p-4 space-y-2.5">
                <div className="text-xs font-mono uppercase tracking-wider text-[#D6D3D1] font-bold">
                  Logarithmic Planetary Impact Benchmark Scale
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                  {HISTORICAL_BENCHMARKS.map((b) => {
                    const isClosest = b.name === result.closest_benchmark.name;
                    return (
                      <div
                        key={b.name}
                        className={`p-2.5 border ${
                          isClosest
                            ? 'bg-[#261910] border-[#EA580C]'
                            : 'bg-[#0C0A09] border-[#2B251F]'
                        }`}
                      >
                        <div className="text-xs font-semibold text-[#F5F0EB] truncate">
                          {b.name}
                        </div>
                        <div className="text-xs font-mono text-[#F97316] font-bold mt-0.5">
                          {formatLargeNumber(b.megatons)} MT
                        </div>
                        <div className="text-[11px] text-[#D6D3D1] mt-1 line-clamp-2 leading-tight">
                          {b.description}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            /* PLANETARY DEFENSE (NASA DART KINETIC IMPACTOR SANDBOX) */
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Left Column: Deflection Mission Controls */}
              <div className="lg:col-span-7 space-y-4">
                <div className="asteroid-card p-4 space-y-2">
                  <div className="text-[11px] font-mono uppercase tracking-wider text-[#38BDF8] font-bold">
                    NASA DART (Double Asteroid Redirection Test) Momentum Transfer
                  </div>
                  <h2 className="text-xl font-display font-bold text-white">
                    Kinetic Impactor Orbital Deflection Mission
                  </h2>
                  <p className="text-xs sm:text-[13px] text-[#E7E2DC] leading-relaxed">
                    Configure lead warning time, spacecraft interceptor mass, and ejecta momentum
                    enhancement factor (β) to deflect the {deflectionParams.diameter_m}m asteroid
                    outside Earth&apos;s 1.25 R⊕ gravitational capture cross-section.
                  </p>
                </div>

                {/* Method Selector */}
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      {
                        id: 'kinetic_impactor',
                        label: 'Kinetic Impactor (DART)',
                        sub: 'High-speed momentum transfer',
                      },
                      {
                        id: 'gravity_tractor',
                        label: 'Gravity Tractor',
                        sub: 'Continuous station-keeping',
                      },
                      {
                        id: 'nuclear_standoff',
                        label: 'Standoff X-Ray Ablation',
                        sub: 'Last-resort vapor thrust',
                      },
                    ] as const
                  ).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => onUpdateDeflection({ method: m.id })}
                      className={`asteroid-card p-3 text-left border transition-colors cursor-pointer ${
                        deflectionParams.method === m.id
                          ? 'bg-[#10222E] border-[#38BDF8] text-[#F5F0EB]'
                          : 'bg-[#12100E] border-[#2B251F] text-[#D6D3D1] hover:text-[#F5F0EB]'
                      }`}
                    >
                      <div className="text-xs font-mono font-bold">{m.label}</div>
                      <div className="text-[11px] text-[#A89F94] mt-0.5">{m.sub}</div>
                    </button>
                  ))}
                </div>

                {/* 3 Deflection Sliders */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="asteroid-card p-3">
                    <div className="flex justify-between text-xs mb-1.5 font-medium">
                      <span className="text-[#D6D3D1]">Warning Lead Time</span>
                      <span className="font-mono text-[#38BDF8] font-bold">
                        {deflectionParams.warning_years} yrs
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.5}
                      max={25}
                      step={0.5}
                      value={deflectionParams.warning_years}
                      onChange={(e) =>
                        onUpdateDeflection({ warning_years: Number(e.target.value) })
                      }
                      className="w-full cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] font-mono text-[#A89F94] mt-1">
                      <span>0.5 yr</span>
                      <span>25 yrs</span>
                    </div>
                  </div>

                  <div className="asteroid-card p-3">
                    <div className="flex justify-between text-xs mb-1.5 font-medium">
                      <span className="text-[#D6D3D1]">Spacecraft Mass</span>
                      <span className="font-mono text-[#F97316] font-bold">
                        {deflectionParams.impactor_mass_kg} kg
                      </span>
                    </div>
                    <input
                      type="range"
                      min={500}
                      max={20000}
                      step={250}
                      value={deflectionParams.impactor_mass_kg}
                      onChange={(e) =>
                        onUpdateDeflection({ impactor_mass_kg: Number(e.target.value) })
                      }
                      className="w-full cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] font-mono text-[#A89F94] mt-1">
                      <span>500 kg (DART)</span>
                      <span>20,000 kg</span>
                    </div>
                  </div>

                  <div className="asteroid-card p-3">
                    <div className="flex justify-between text-xs mb-1.5 font-medium">
                      <span className="text-[#D6D3D1]">Momentum Factor (β)</span>
                      <span className="font-mono text-[#10B981] font-bold">
                        {deflectionParams.beta_factor.toFixed(1)}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={1.0}
                      max={6.0}
                      step={0.1}
                      value={deflectionParams.beta_factor}
                      onChange={(e) =>
                        onUpdateDeflection({ beta_factor: Number(e.target.value) })
                      }
                      className="w-full cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] font-mono text-[#A89F94] mt-1">
                      <span>1.0 (Plastic)</span>
                      <span>3.6 (Dimorphos)</span>
                    </div>
                  </div>
                </div>

                {/* Primary Execute Button Banner for DART Sandbox */}
                <div className="asteroid-card p-3.5 bg-gradient-to-r from-[#0C1A24] to-[#122332] border border-[#38BDF8]/60 flex flex-wrap items-center justify-between gap-3 shadow-lg">
                  <div className="space-y-0.5">
                    <div className="text-xs font-mono font-bold text-white flex items-center gap-1.5">
                      <Rocket className="w-4 h-4 text-[#38BDF8] animate-pulse" />
                      <span>Execute Kinetic Impactor Interception</span>
                    </div>
                    <p className="text-[11px] text-[#BAE6FD]">
                      {hasExecutedDart
                        ? 'Simulation executed · Orbit trajectory arc updated live on the 3D globe.'
                        : 'Parameters modified · Click Run to calculate new momentum transfer.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleRunDartImpact}
                    disabled={isExecutingDart}
                    className="asteroid-btn px-4 py-2 bg-gradient-to-r from-[#0284C7] via-[#0EA5E9] to-[#38BDF8] hover:brightness-110 text-[#090807] text-xs font-mono font-bold uppercase tracking-wider flex items-center gap-2 shadow-[0_0_16px_rgba(14,165,233,0.5)] transition-all cursor-pointer"
                  >
                    {isExecutingDart ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Computing Orbit...</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Run DART Impact</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Right Column: Live Deflection Telemetry Outcome */}
              <div className="lg:col-span-5 flex flex-col justify-between asteroid-card p-4 space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono uppercase tracking-wider text-[#D6D3D1] font-semibold">
                      Orbital Deflection Outcome
                    </span>
                    <span
                      className={`asteroid-chip px-2.5 py-0.5 text-xs font-mono font-bold ${
                        deflectionResult.status === 'DEFLECTED'
                          ? 'bg-[#064E3B] text-[#6EE7B7] border border-[#10B981]'
                          : deflectionResult.status === 'GRAZING_RISK'
                          ? 'bg-[#451A03] text-[#FDBA74] border border-[#F97316]'
                          : 'bg-[#451A03]/95 text-[#FDBA74] border border-[#F59E0B]'
                      }`}
                    >
                      {deflectionResult.status.replace('_', ' ')}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-[#090807] border border-[#2B251F] p-3">
                      <div className="text-[10px] font-mono uppercase text-[#D6D3D1]">
                        Imparted Velocity (Δv)
                      </div>
                      <div className="text-xl font-mono font-bold text-[#38BDF8] mt-0.5">
                        {deflectionResult.delta_v_mm_s.toFixed(2)} mm/s
                      </div>
                    </div>
                    <div className="bg-[#090807] border border-[#2B251F] p-3">
                      <div className="text-[10px] font-mono uppercase text-[#D6D3D1]">
                        B-Plane Miss Distance
                      </div>
                      <div className="text-xl font-mono font-bold text-[#10B981] mt-0.5">
                        {deflectionResult.earth_radii_clearance.toFixed(2)} R<sub>E</sub>
                      </div>
                    </div>
                  </div>

                  <div className="bg-[#090807] border border-[#2B251F] p-3 text-xs font-mono space-y-1">
                    <div className="text-[#D6D3D1]">
                      Deflected Drift:{' '}
                      <span className="text-white font-semibold">
                        {formatLargeNumber(deflectionResult.deflected_distance_km)} km
                      </span>
                    </div>
                    <div className="text-[#D6D3D1]">
                      Safe Capture Clearance:{' '}
                      <span className="text-white font-semibold">
                        {formatLargeNumber(deflectionResult.safe_threshold_km)} km (1.25 R<sub>E</sub>)
                      </span>
                    </div>
                  </div>

                  {/* Warning / Caution Banner in High-Contrast Orange/Amber */}
                  {deflectionResult.status !== 'DEFLECTED' ? (
                    <div className="p-3 bg-[#2D1606]/95 border border-[#F59E0B] rounded-none flex items-start gap-2.5 text-xs text-[#FDE68A] leading-relaxed">
                      <AlertTriangle className="w-4 h-4 text-[#F59E0B] shrink-0 mt-0.5" />
                      <div>
                        <strong className="text-[#FDBA74] uppercase tracking-wide block mb-0.5">
                          {deflectionResult.status === 'GRAZING_RISK'
                            ? 'Warning: Marginal Orbital Clearance'
                            : 'Caution: Insufficient Deflection Trajectory'}
                        </strong>
                        <span>{deflectionResult.summary}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 bg-[#063326]/95 border border-[#10B981] rounded-none flex items-start gap-2.5 text-xs text-[#A7F3D0] leading-relaxed">
                      <CheckCircle2 className="w-4 h-4 text-[#10B981] shrink-0 mt-0.5" />
                      <div>
                        <strong className="text-[#6EE7B7] uppercase tracking-wide block mb-0.5">
                          Success: Earth Impact Avoided
                        </strong>
                        <span>{deflectionResult.summary}</span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="pt-2 border-t border-[#2E2720] flex items-center justify-between gap-3">
                  <label className="flex items-center gap-2 text-xs font-mono text-[#D6D3D1] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showDeflectionArc}
                      onChange={(e) => onToggleDeflectionArc(e.target.checked)}
                      className="accent-[#38BDF8]"
                    />
                    <span>Render 3D Deflected Trajectory Tube</span>
                  </label>
                  <button
                    type="button"
                    onClick={onClose}
                    className="asteroid-btn px-3 py-1.5 bg-[#38BDF8] text-[#090807] text-xs font-mono font-bold uppercase tracking-wider cursor-pointer"
                  >
                    Inspect 3D Orbit
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
