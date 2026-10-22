export type CompositionType = 'ice' | 'porous_rock' | 'stony' | 'iron';

export type AsteroidShapeArchetype =
  | 'bennu_rubble'
  | 'apophis_bilobed'
  | 'didymos_binary'
  | 'iron_monolith'
  | 'comet_nucleus'
  | 'chondrite_fragment';

export type ImpactRegimeType =
  | 'airburst'
  | 'ocean_tsunami'
  | 'simple_crater'
  | 'complex_crater'
  | 'crust_melt_extinction';

export interface AsteroidMorphologySpec {
  archetype: AsteroidShapeArchetype;
  taxonomicClass: string;
  shapeLabel: string;
  geometricAlbedo: number;
  baseColorHex: number;
  secondaryColorHex: number;
  roughness: number;
  metalness: number;
  axialRatio: [number, number, number];
  boulderCount: number;
  hasMoonlet: boolean;
  hasCryoJets: boolean;
  plasmaPrimaryHex: number;
  plasmaSecondaryHex: number;
  spectrumLabel: string;
  yieldStrengthMPa: number;
}

export interface AtmosphericEntryTelemetry {
  altitudeKm: number;
  atmosphericLayer: 'Deep Space Vacuum' | 'Thermosphere' | 'Mesosphere' | 'Stratosphere' | 'Troposphere';
  densityKgM3: number;
  ramPressureMPa: number;
  yieldStrengthMPa: number;
  overpressureRatio: number;
  isInAtmosphere: boolean;
  isFragmenting: boolean;
  isTerminalBurst: boolean;
  pancakeFactor: number;
  remainingMassPct: number;
  activeFragmentCount: number;
  plasmaIntensity: number;
  currentVelocityKms: number;
}

export interface NeoObject {
  id: string;
  name: string;
  is_potentially_hazardous: boolean;
  nasa_jpl_url?: string;
  est_diameter_m_avg: number;
  est_diameter_m_min: number;
  est_diameter_m_max: number;
  est_velocity_km_s: number;
  composition_hint?: CompositionType;
  close_approach_date?: string;
  miss_distance_km?: number;
  description?: string;
}

export interface TargetPreset {
  id: string;
  name: string;
  region: string;
  lat: number;
  lon: number;
  targetDensityKgM3: number;
  isWater: boolean;
  description: string;
}

export interface ImpactParameters {
  diameter_m: number;
  velocity_km_s: number;
  angle_deg: number;
  composition: CompositionType;
  custom_density_kg_m3?: number;
  target_density_kg_m3?: number;
  target_lat?: number;
  target_lon?: number;
  terrain_elevation_m?: number;
}

export interface SocioeconomicImpactMetrics {
  region_label: string;
  settlement_classification: string;
  population_density_km2: number;
  regional_gdp_per_capita_usd: number;
  displaced_population: number;
  estimated_casualties: number;
  infrastructure_loss_usd: number;
  infrastructure_loss_formatted: string;
  affected_area_km2: number;
}

export type FirestormRegimeType =
  | 'none'
  | 'local_thermal_ignition'
  | 'continental_firestorm'
  | 'global_firestorm_envelope';

export interface ImpactSimulationResult {
  diameter_m: number;
  velocity_km_s: number;
  angle_deg: number;
  composition: CompositionType;
  density_kg_m3: number;
  mass_kg: number;
  energy_j: number;
  tnt_kilotons: number;
  tnt_megatons: number;
  hiroshima_multiples: number;
  tsar_bomba_multiples: number;
  crater_km: number;
  crater_Major_axis_km: number;
  crater_minor_axis_km: number;
  crater_ellipticity: number;
  crater_depth_km: number;
  rim_height_m: number;
  terrain_elevation_m: number;
  fireball_km: number;
  severe_blast_km: number;
  moderate_blast_km: number;
  thermal_burn_km: number;
  blast_km: number;
  equivalent_earthquake_Mw: number;
  is_airburst: boolean;
  breakup_altitude_km: number;
  burst_altitude_km: number;
  torino_scale: number;
  severity_label: string;
  impact_regime: ImpactRegimeType;
  crater_morphology:
    | 'none'
    | 'simple_bowl'
    | 'complex_terraced'
    | 'ocean_cavity'
    | 'planetary_melt_basin';
  is_ocean_impact: boolean;
  tsunami_wave_height_m: number;
  ejecta_butterfly_asymmetry: number;
  downrange_ejecta_reach_km: number;
  yield_strength_mpa: number;
  firestorm_regime: FirestormRegimeType;
  firestorm_label: string;
  firestorm_coverage_pct: number;
  socioeconomic: SocioeconomicImpactMetrics;
  closest_benchmark: {
    name: string;
    megatons: number;
    description: string;
  };
  notes: string;
}

export type DeflectionMethod = 'kinetic_impactor' | 'gravity_tractor' | 'nuclear_standoff';

export interface DeflectionParameters {
  diameter_m: number;
  composition: CompositionType;
  warning_years: number;
  impactor_mass_kg: number;
  relative_impact_vel_km_s: number;
  beta_factor: number;
  method: DeflectionMethod;
}

export interface DeflectionResult {
  asteroid_mass_kg: number;
  delta_v_mm_s: number;
  deflected_distance_km: number;
  earth_radii_clearance: number;
  safe_threshold_km: number;
  status: 'DEFLECTED' | 'GRAZING_RISK' | 'IMPACT_LOCKED';
  summary: string;
}

export type WorkspaceTab = 'simulator' | 'deflection' | 'academy' | 'catalog';
export type SplitCamMode = 'auto' | 'pinned' | 'hidden';
export type PipDisplayMode = 'entry_3d' | 'topo_2d';


