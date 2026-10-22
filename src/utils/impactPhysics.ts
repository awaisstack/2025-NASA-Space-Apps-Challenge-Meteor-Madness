import type {
  CompositionType,
  ImpactParameters,
  ImpactSimulationResult,
  DeflectionParameters,
  DeflectionResult,
  NeoObject,
  TargetPreset,
  AsteroidMorphologySpec,
  AtmosphericEntryTelemetry,
  ImpactRegimeType,
  FirestormRegimeType,
  SocioeconomicImpactMetrics,
} from '../types.ts';

export const COMPOSITIONS: Record<CompositionType, {
  name: string;
  exemplar: string;
  densityKgM3: number;
  strengthMPa: number;
  description: string;
  albedo: number;
  colorHex: string;
}> = {
  ice: {
    name: 'Cometary Ice (67P Cryo-Nucleus)',
    exemplar: '67P/Churyumov-Gerasimenko · Porous Volatile',
    densityKgM3: 1000,
    strengthMPa: 0.2,
    description: 'Volatile-rich icy nucleus; disrupts high in the upper stratosphere (similar to Tunguska cometary fragments).',
    albedo: 0.06,
    colorHex: '#38BDF8',
  },
  porous_rock: {
    name: 'Rubble-Pile Carbonaceous (Bennu C-Type)',
    exemplar: '101955 Bennu / Ryugu · Loose Rubble Pile',
    densityKgM3: 1500,
    strengthMPa: 0.65,
    description: 'Primitive carbon-rich rubble pile (~75% of known asteroids, like Bennu, Ryugu, and 2008 TC3). Prone to high-altitude atmospheric airburst.',
    albedo: 0.045,
    colorHex: '#94A3B8',
  },
  stony: {
    name: 'Stony Chondrite (Chelyabinsk S-Type)',
    exemplar: 'Chelyabinsk LL5 / Apophis · Fractured Silicate',
    densityKgM3: 3000,
    strengthMPa: 2.5,
    description: 'Macro-fractured silicate rock (~17% of asteroids, like Chelyabinsk and Itokawa). Small bodies (< 25m) airburst in the stratosphere.',
    albedo: 0.20,
    colorHex: '#F59E0B',
  },
  iron: {
    name: 'Solid Iron-Nickel Core (Campo del Cielo M-Type)',
    exemplar: 'Campo del Cielo / Canyon Diablo · Solid Fe-Ni',
    densityKgM3: 7800,
    strengthMPa: 85.0,
    description: 'Dense differentiated planetary core fragment (like Campo del Cielo, Psyche, or Barringer Crater impactor). Resists breakup to gouge deep craters.',
    albedo: 0.18,
    colorHex: '#E11D48',
  },
};

export const HISTORICAL_BENCHMARKS = [
  { name: 'Hiroshima Atomic Bomb (1945)', megatons: 0.015, description: '15 kilotons fission yield' },
  { name: 'Chelyabinsk Meteor Airburst (2013)', megatons: 0.5, description: '20m stony superbolide over Russia' },
  { name: 'Tunguska Atmospheric Event (1908)', megatons: 12.0, description: '50m impactor flattened 2,150 km² of forest' },
  { name: 'Barringer Meteor Crater (50,000 BP)', megatons: 10.0, description: '50m iron impactor in Arizona (1.2 km crater)' },
  { name: 'Tsar Bomba Thermonuclear Test (1961)', megatons: 50.0, description: 'Largest human-made detonation in history' },
  { name: '1883 Krakatoa Volcanic Eruption', megatons: 200.0, description: 'Heard 4,800 km away; global atmospheric cooling' },
  { name: 'Apophis Hypothetical Impact', megatons: 1150.0, description: '370m stony NEA regional catastrophe' },
  { name: 'Chicxulub K-Pg Extinction (66 Ma)', megatons: 100000000.0, description: '10 km impactor; 180 km crater; global mass extinction' },
];

export const TARGET_PRESETS: TargetPreset[] = [
  {
    id: 'barringer',
    name: 'Barringer Crater, Arizona',
    region: 'North America (Colorado Plateau, 1,740m)',
    lat: 35.0272,
    lon: -111.0225,
    targetDensityKgM3: 2700,
    isWater: false,
    description: 'Best-preserved terrestrial impact site on Earth (50,000 years old, 1.2 km simple bowl crater).',
  },
  {
    id: 'wood_buffalo',
    name: 'Boreal Shield, Alberta (59.2°N)',
    region: 'North America (Canadian Shield, 295m)',
    lat: 59.2,
    lon: -113.5,
    targetDensityKgM3: 2750,
    isWater: false,
    description: 'Crystalline Precambrian granite-gneiss shield; benchmark site for oblique crater ellipticity & remote infrastructure modeling.',
  },
  {
    id: 'chicxulub',
    name: 'Chicxulub Peninsula, Yucatán',
    region: 'Gulf of Mexico (Carbonate Shelf, 12m)',
    lat: 21.4000,
    lon: -89.5167,
    targetDensityKgM3: 2550,
    isWater: false,
    description: 'Site of the 66-million-year-old K-Pg boundary extinction impactor (~180 km multi-ring basin).',
  },
  {
    id: 'tunguska',
    name: 'Podkamennaya Tunguska, Siberia',
    region: 'Eurasia (Boreal Taiga, 410m)',
    lat: 60.886,
    lon: 101.894,
    targetDensityKgM3: 2650,
    isWater: false,
    description: 'Site of the 1908 atmospheric airburst that leveled 80 million trees across 2,150 km².',
  },
  {
    id: 'pacific_basin',
    name: 'Point Nemo (South Pacific Basin)',
    region: 'Deep Ocean (-4,120m Abyssal Plain)',
    lat: -48.8767,
    lon: -123.3933,
    targetDensityKgM3: 1025,
    isWater: true,
    description: 'Oceanic pole of inaccessibility; triggers deep-water acoustic cavity and 3D tsunami wave rings.',
  },
  {
    id: 'tokyo_bay',
    name: 'Tokyo Metropolitan Basin',
    region: 'East Asia (High-Density Urban, 38m)',
    lat: 35.6762,
    lon: 139.6503,
    targetDensityKgM3: 2600,
    isWater: false,
    description: 'High-density urban coastal megaregion for civil defense, population displacement, and GDP infrastructure loss modeling.',
  },
];

export const CURATED_NEOS: NeoObject[] = [
  {
    id: 'impactor-2025',
    name: 'Impactor-2025 (NASA Space Apps Scenario)',
    is_potentially_hazardous: true,
    nasa_jpl_url: 'https://cneos.jpl.nasa.gov/pd/cs/',
    est_diameter_m_avg: 300,
    est_diameter_m_min: 240,
    est_diameter_m_max: 360,
    est_velocity_km_s: 25.0,
    composition_hint: 'stony',
    close_approach_date: '2025-10-05',
    miss_distance_km: 0,
    description: 'Official 2025 NASA Space Apps Challenge "Meteor Madness" reference threat scenario.',
  },
  {
    id: '99942',
    name: '99942 Apophis (2004 MN4)',
    is_potentially_hazardous: true,
    nasa_jpl_url: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=99942',
    est_diameter_m_avg: 370,
    est_diameter_m_min: 340,
    est_diameter_m_max: 400,
    est_velocity_km_s: 30.73,
    composition_hint: 'stony',
    close_approach_date: '2029-04-13',
    miss_distance_km: 31600,
    description: 'Bilobed Sq-type contact binary passing closer than geostationary satellites on April 13, 2029.',
  },
  {
    id: '101955',
    name: '101955 Bennu (Loose Rubble Pile)',
    is_potentially_hazardous: true,
    nasa_jpl_url: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=101955',
    est_diameter_m_avg: 490,
    est_diameter_m_min: 480,
    est_diameter_m_max: 510,
    est_velocity_km_s: 27.7,
    composition_hint: 'porous_rock',
    close_approach_date: '2182-09-24',
    miss_distance_km: 203000,
    description: 'Spinning-top carbonaceous rubble-pile asteroid (albedo 0.045) sampled by NASA OSIRIS-REx.',
  },
  {
    id: '65803',
    name: '65803 Didymos & Dimorphos (DART Target)',
    is_potentially_hazardous: true,
    nasa_jpl_url: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=65803',
    est_diameter_m_avg: 160,
    est_diameter_m_min: 150,
    est_diameter_m_max: 170,
    est_velocity_km_s: 22.1,
    composition_hint: 'stony',
    close_approach_date: '2022-09-26',
    miss_distance_km: 11000000,
    description: 'Binary NEO system; moonlet Dimorphos (160m) was deflected by NASA DART in 2022.',
  },
  {
    id: '2024-yr4',
    name: '2024 YR4 (CNEOS Sentry Watch)',
    is_potentially_hazardous: true,
    nasa_jpl_url: 'https://cneos.jpl.nasa.gov/sentry/',
    est_diameter_m_avg: 55,
    est_diameter_m_min: 40,
    est_diameter_m_max: 90,
    est_velocity_km_s: 17.3,
    composition_hint: 'stony',
    close_approach_date: '2032-12-22',
    miss_distance_km: 120000,
    description: 'Tunguska-scale stony Apollo-class asteroid monitored by NASA Planetary Defense Coordination Office.',
  },
  {
    id: '2008-tc3-5m',
    name: '2008 TC3 / 5m Meteoroid (Stratospheric Airburst)',
    is_potentially_hazardous: false,
    nasa_jpl_url: 'https://cneos.jpl.nasa.gov/fireballs/',
    est_diameter_m_avg: 5,
    est_diameter_m_min: 4,
    est_diameter_m_max: 6,
    est_velocity_km_s: 19.5,
    composition_hint: 'porous_rock',
    close_approach_date: '2008-10-07',
    miss_distance_km: 0,
    description: '5m carbonaceous meteoroid that disintegrated in a 37 km stratospheric airburst over Sudan with zero ground crater.',
  },
  {
    id: 'chelyabinsk-sim',
    name: 'Chelyabinsk Bolide (2013 Reference)',
    is_potentially_hazardous: false,
    nasa_jpl_url: 'https://cneos.jpl.nasa.gov/fireballs/',
    est_diameter_m_avg: 20,
    est_diameter_m_min: 18,
    est_diameter_m_max: 22,
    est_velocity_km_s: 19.16,
    composition_hint: 'stony',
    close_approach_date: '2013-02-15',
    miss_distance_km: 0,
    description: 'LL5 chondrite superbolide that fragmented and airburst at 29.7 km altitude over the Urals.',
  },
  {
    id: '16-psyche-frag',
    name: 'Campo del Cielo / Barringer (50m Fe-Ni Core)',
    is_potentially_hazardous: true,
    nasa_jpl_url: 'https://ssd.jpl.nasa.gov/',
    est_diameter_m_avg: 50,
    est_diameter_m_min: 45,
    est_diameter_m_max: 55,
    est_velocity_km_s: 12.8,
    composition_hint: 'iron',
    close_approach_date: '2025-11-14',
    miss_distance_km: 0,
    description: 'Solid nickel-iron core fragment (Campo del Cielo / Canyon Diablo class) capable of punching a 1.2 km simple bowl crater.',
  },
  {
    id: 'chicxulub-sim',
    name: 'Chicxulub Impactor (K-Pg Extinction Scale)',
    is_potentially_hazardous: true,
    nasa_jpl_url: 'https://cneos.jpl.nasa.gov/',
    est_diameter_m_avg: 10000,
    est_diameter_m_min: 9500,
    est_diameter_m_max: 11000,
    est_velocity_km_s: 20.0,
    composition_hint: 'porous_rock',
    close_approach_date: '-66000000',
    miss_distance_km: 0,
    description: '10 km carbonaceous impactor unleashing planetary crust melt and a global stratospheric dust veil.',
  },
];

/**
 * Returns the scientifically calibrated 3D morphology, albedo, axial ratio,
 * and emission spectrum profile for any NEO preset + composition + diameter.
 */
export function getAsteroidMorphologySpec(
  neoId: string,
  composition: CompositionType,
  diameterM: number
): AsteroidMorphologySpec {
  if (composition === 'ice') {
    return {
      archetype: 'comet_nucleus',
      taxonomicClass: 'JFC / Halley-Type Cryo-Nucleus',
      shapeLabel: 'Bilobed Dirty-Ice Nucleus (67P-Class)',
      geometricAlbedo: 0.06,
      baseColorHex: 0x36495c,
      secondaryColorHex: 0xbae6fd,
      roughness: 0.56,
      metalness: 0.14,
      axialRatio: [1.52, 0.78, 0.84],
      boulderCount: 28,
      hasMoonlet: false,
      hasCryoJets: true,
      plasmaPrimaryHex: 0x38bdf8,
      plasmaSecondaryHex: 0xe0f2fe,
      spectrumLabel: 'Cyan-Blue CN / H₂O⁺ Ionization',
      yieldStrengthMPa: COMPOSITIONS.ice.strengthMPa,
    };
  }

  if (composition === 'iron' || neoId === '16-psyche-frag') {
    return {
      archetype: 'iron_monolith',
      taxonomicClass: 'M-Type Nickel-Iron (Campo del Cielo Fe-Ni)',
      shapeLabel: 'Regmaglypt-Pitted Metallic Core',
      geometricAlbedo: 0.18,
      baseColorHex: 0x8b9bb0,
      secondaryColorHex: 0xcbd5e1,
      roughness: 0.30,
      metalness: 0.86,
      axialRatio: [1.18, 0.92, 0.96],
      boulderCount: 12,
      hasMoonlet: false,
      hasCryoJets: false,
      plasmaPrimaryHex: 0xfff7ed,
      plasmaSecondaryHex: 0xf97316,
      spectrumLabel: 'Incandescent Fe-Ni Continuum',
      yieldStrengthMPa: COMPOSITIONS.iron.strengthMPa,
    };
  }

  if (neoId === '65803') {
    return {
      archetype: 'didymos_binary',
      taxonomicClass: 'S-Type Binary System (Didymos + Dimorphos)',
      shapeLabel: 'Oblate Top Primary + Orbiting Moonlet',
      geometricAlbedo: 0.16,
      baseColorHex: 0x8c7f70,
      secondaryColorHex: 0xb0a292,
      roughness: 0.82,
      metalness: 0.18,
      axialRatio: [1.08, 0.88, 1.06],
      boulderCount: 38,
      hasMoonlet: true,
      hasCryoJets: false,
      plasmaPrimaryHex: 0xfbbf24,
      plasmaSecondaryHex: 0x4ade80,
      spectrumLabel: 'Silicate Mg-Fe / Na-D Doublet',
      yieldStrengthMPa: COMPOSITIONS[composition].strengthMPa,
    };
  }

  if (neoId === '101955' || composition === 'porous_rock') {
    return {
      archetype: 'bennu_rubble',
      taxonomicClass: 'B/C-Type Carbonaceous Rubble Pile',
      shapeLabel: 'Spinning-Top Equatorial Ridge (Bennu/Ryugu)',
      geometricAlbedo: 0.045,
      baseColorHex: 0x3b424c,
      secondaryColorHex: 0x57606e,
      roughness: 0.95,
      metalness: 0.08,
      axialRatio: [1.06, 0.92, 1.06],
      boulderCount: 48,
      hasMoonlet: false,
      hasCryoJets: false,
      plasmaPrimaryHex: 0xf59e0b,
      plasmaSecondaryHex: 0x2dd4bf,
      spectrumLabel: 'Na-Amber / C₂ Carbonaceous Wake',
      yieldStrengthMPa: COMPOSITIONS.porous_rock.strengthMPa,
    };
  }

  if (neoId === '99942' || (diameterM >= 180 && diameterM <= 950)) {
    return {
      archetype: 'apophis_bilobed',
      taxonomicClass: 'Sq-Type Chondritic Contact Binary',
      shapeLabel: 'Asymmetric Bilobed Peanut (Apophis/Itokawa)',
      geometricAlbedo: 0.20,
      baseColorHex: 0x998b7a,
      secondaryColorHex: 0xb8a998,
      roughness: 0.78,
      metalness: 0.20,
      axialRatio: [1.58, 0.75, 0.82],
      boulderCount: 34,
      hasMoonlet: false,
      hasCryoJets: false,
      plasmaPrimaryHex: 0xf59e0b,
      plasmaSecondaryHex: 0x86efac,
      spectrumLabel: 'Chondritic Silicate Na / Mg I',
      yieldStrengthMPa: COMPOSITIONS.stony.strengthMPa,
    };
  }

  return {
    archetype: 'chondrite_fragment',
    taxonomicClass: 'LL5 Ordinary Chondrite Monolith',
    shapeLabel: 'Angular Shock-Veined Silicate Bolide',
    geometricAlbedo: 0.21,
    baseColorHex: 0xa19384,
    secondaryColorHex: 0xc4b7a6,
    roughness: 0.80,
    metalness: 0.22,
    axialRatio: [1.28, 0.84, 0.94],
    boulderCount: 22,
    hasMoonlet: false,
    hasCryoJets: false,
    plasmaPrimaryHex: 0xfbbf24,
    plasmaSecondaryHex: 0x38bdf8,
    spectrumLabel: 'Superbolide Silicate-Vapor Plasma',
    yieldStrengthMPa: COMPOSITIONS[composition].strengthMPa,
  };
}

/**
 * Geographic ocean vs. continent classifier for any (lat, lon) coordinate on Earth.
 */
export function isOceanCoordinate(lat: number, lon: number): boolean {
  for (const preset of TARGET_PRESETS) {
    if (Math.abs(lat - preset.lat) < 1.5 && Math.abs(lon - preset.lon) < 1.5) {
      return preset.isWater;
    }
  }
  if (lat >= 15 && lat <= 72 && lon >= -168 && lon <= -52) {
    if (lat >= 21.8 && lat <= 28.5 && lon >= -96 && lon <= -83) return true;
    return false;
  }
  if (lat >= -55 && lat <= 15 && lon >= -82 && lon <= -34) return false;
  if (lat >= 10 && lat <= 75 && lon >= -10 && lon <= 145) return false;
  if (lat >= -35 && lat <= 37 && lon >= -17 && lon <= 51) return false;
  if (lat >= -43 && lat <= -11 && lon >= 113 && lon <= 154) return false;
  if (lat <= -66) return false;
  if (lat >= 60 && lat <= 83 && lon >= -73 && lon <= -18) return false;

  return true;
}

/**
 * USGS / ETOPO1 Hypsometric Elevation Model (in meters relative to Mean Sea Level)
 */
export function estimateTerrainElevationM(
  lat: number,
  lon: number,
  isOcean: boolean
): number {
  if (Math.abs(lat - 35.0272) < 1.0 && Math.abs(lon - -111.0225) < 1.0) return 1740; // Barringer Colorado Plateau
  if (Math.abs(lat - 59.2) < 1.2 && Math.abs(lon - -113.5) < 1.2) return 295; // Wood Buffalo / Alberta Shield
  if (Math.abs(lat - 21.4) < 1.0 && Math.abs(lon - -89.5167) < 1.0) return 12; // Chicxulub Carbonate Shelf
  if (Math.abs(lat - 60.886) < 1.0 && Math.abs(lon - 101.894) < 1.0) return 410; // Central Siberian Plateau
  if (Math.abs(lat - 35.6762) < 1.0 && Math.abs(lon - 139.6503) < 1.0) return 38; // Tokyo Kanto Plain
  if (Math.abs(lat - -48.8767) < 2.0 && Math.abs(lon - -123.3933) < 2.0) return -4120; // Point Nemo Abyssal Plain

  const radLat = (lat * Math.PI) / 180;
  const radLon = (lon * Math.PI) / 180;
  const harmonic =
    Math.sin(radLat * 3.2 + radLon * 2.1) * 0.5 +
    Math.cos(radLat * 5.7 - radLon * 4.3) * 0.35 +
    Math.sin(radLat * 11.0 + radLon * 9.0) * 0.15;

  if (isOcean) {
    return Math.round(-3650 + harmonic * 1450);
  }
  // Major mountain belts (Tibetan Plateau, Andes, Rockies)
  if (lat >= 27 && lat <= 38 && lon >= 75 && lon <= 102) {
    return Math.round(4400 + harmonic * 850);
  }
  if (lat >= -35 && lat <= -10 && lon >= -72 && lon <= -64) {
    return Math.round(3600 + harmonic * 700);
  }
  if (lat >= 32 && lat <= 52 && lon >= -116 && lon <= -104) {
    return Math.round(1650 + harmonic * 480);
  }
  return Math.round(Math.max(15, 380 + harmonic * 320));
}

/**
 * Cross-references impact coordinates with global population density grids (GPWv4)
 * and regional GDP per capita records to estimate displaced population, immediate casualties,
 * and capital infrastructure loss in USD.
 */
export function calculateSocioeconomicImpact(
  lat: number,
  lon: number,
  isOcean: boolean,
  severe_blast_km: number,
  moderate_blast_km: number,
  blast_km: number,
  thermal_burn_km: number,
  tsunami_wave_height_m: number
): SocioeconomicImpactMetrics {
  const METROS = [
    { name: 'Tokyo-Yokohama Megaregion', lat: 35.68, lon: 139.65, popDensity: 4750, gdpPerCap: 46500 },
    { name: 'New York-Northeast Corridor', lat: 40.71, lon: -74.01, popDensity: 2950, gdpPerCap: 84000 },
    { name: 'London-Thames Basin', lat: 51.51, lon: -0.13, popDensity: 3400, gdpPerCap: 62000 },
    { name: 'Western European Core', lat: 48.86, lon: 2.35, popDensity: 1850, gdpPerCap: 54000 },
    { name: 'Indo-Gangetic Plain', lat: 28.61, lon: 77.21, popDensity: 2400, gdpPerCap: 9200 },
    { name: 'Yangtze River Delta', lat: 31.23, lon: 121.47, popDensity: 3600, gdpPerCap: 29000 },
    { name: 'Pearl River Delta', lat: 23.13, lon: 113.26, popDensity: 3200, gdpPerCap: 27000 },
    { name: 'Nile Delta Corridor', lat: 30.04, lon: 31.24, popDensity: 2650, gdpPerCap: 14500 },
    { name: 'São Paulo-Rio Megaregion', lat: -23.55, lon: -46.63, popDensity: 2100, gdpPerCap: 21000 },
    { name: 'Los Angeles-SoCal Basin', lat: 34.05, lon: -118.24, popDensity: 2150, gdpPerCap: 78000 },
    { name: 'Chelyabinsk Industrial Urals', lat: 55.15, lon: 61.43, popDensity: 145, gdpPerCap: 24500 },
    { name: 'Yucatán Coastal Shelf', lat: 21.4, lon: -89.52, popDensity: 92, gdpPerCap: 18500 },
  ];

  let popDensity = 0;
  let gdpPerCap = 32000;
  let classification = 'Continental Interior';

  // Check proximity to major urban & coastal corridors first
  let closestDistDeg = 999;
  let matchedMetro = METROS[0];
  for (const m of METROS) {
    const d = Math.hypot(lat - m.lat, lon - m.lon);
    if (d < closestDistDeg) {
      closestDistDeg = d;
      matchedMetro = m;
    }
  }
  const isCoastalMegacity = closestDistDeg < 2.2;

  if (isCoastalMegacity) {
    const falloff = Math.exp(-closestDistDeg * 0.65);
    popDensity = Math.round(matchedMetro.popDensity * falloff + 85);
    gdpPerCap = matchedMetro.gdpPerCap;
    classification = `${matchedMetro.name} (High-Density Urban)`;
  } else if (isOcean) {
    popDensity = 0;
    gdpPerCap = 42000;
    classification = 'Deep Oceanic Basin (Maritime Corridor)';
  } else if (Math.abs(lat) > 56) {
    // Sub-arctic Boreal Shield / Taiga (e.g., 59.2°N, -113.5°W Alberta / Siberia)
    popDensity = Math.abs(lon - -113.5) < 8 ? 2.4 : 3.2;
    gdpPerCap = lon < -40 ? 64000 : 22000;
    classification =
      lon < -40
        ? 'Boreal Shield (59.2°N, -113.5°W)'
        : 'Sub-Arctic Eurasian Taiga Wilderness';
  } else if (lat >= 30 && lat <= 42 && lon >= -116 && lon <= -104) {
    // Arid American Southwest (Barringer Arizona)
    popDensity = 14.5;
    gdpPerCap = 66000;
    classification = 'Arid Colorado Plateau (Low-Density)';
  } else if (lat >= 10 && lat <= 45 && lon >= 68 && lon <= 125) {
    popDensity = 420;
    gdpPerCap = 19500;
    classification = 'Dense Asian Industrial Belt';
  } else if (lat >= 36 && lat <= 56 && lon >= -8 && lon <= 38) {
    popDensity = 245;
    gdpPerCap = 46000;
    classification = 'European Urban-Industrial Basin';
  } else {
    popDensity = 58;
    gdpPerCap = 31000;
    classification = 'Mixed Continental Settlement Zone';
  }

  const severeRadius = Math.max(severe_blast_km, thermal_burn_km * 0.72);
  const moderateRadius = Math.max(moderate_blast_km, severeRadius * 1.35);
  const evacRadius = Math.max(blast_km, moderateRadius * 1.6);

  const severeAreaKm2 = Math.PI * severeRadius * severeRadius;
  const moderateRingAreaKm2 = Math.max(0, Math.PI * moderateRadius * moderateRadius - severeAreaKm2);
  const affectedAreaKm2 = Math.PI * evacRadius * evacRadius;

  let estimated_casualties = 0;
  let displaced_population = 0;
  let infrastructure_loss_usd = 0;

  if (isOcean && !isCoastalMegacity) {
    // Open-ocean tsunami & shipping/offshore infrastructure exposure if wave height is significant
    if (tsunami_wave_height_m > 3) {
      const coastalExposureFactor = Math.pow(tsunami_wave_height_m / 5, 1.35);
      displaced_population = Math.round(coastalExposureFactor * 48000);
      estimated_casualties = Math.round(coastalExposureFactor * 4200);
      infrastructure_loss_usd = Math.round(coastalExposureFactor * 2.8e9);
    } else {
      displaced_population = 0;
      estimated_casualties = 0;
      infrastructure_loss_usd = Math.round(severeAreaKm2 * 180000); // Maritime/subsea cable disruption
    }
  } else {
    const popInSevere = severeAreaKm2 * popDensity;
    const popInModerate = moderateRingAreaKm2 * popDensity;
    const popInOuter = Math.max(0, affectedAreaKm2 - Math.PI * moderateRadius * moderateRadius) * popDensity;

    estimated_casualties = Math.round(popInSevere * 0.86 + popInModerate * 0.28 + popInOuter * 0.02);
    displaced_population = Math.round(
      Math.max(estimated_casualties, (popInSevere + popInModerate + popInOuter * 0.65) - estimated_casualties * 0.5)
    );

    // Capital stock per capita is ~3.4x annual GDP per capita + regional industrial/grid baseline
    const capitalPerPerson = gdpPerCap * 3.4;
    const baselineInfraPerKm2 = gdpPerCap > 45000 ? 4.2e6 : 1.8e6;
    infrastructure_loss_usd = Math.round(
      (popInSevere * 0.95 + popInModerate * 0.55 + popInOuter * 0.14) * capitalPerPerson +
        (severeAreaKm2 * 1.0 + moderateRingAreaKm2 * 0.45) * baselineInfraPerKm2
    );
  }

  const formatUsd = (usd: number): string => {
    if (usd >= 1e12) return `$${(usd / 1e12).toFixed(2)}T USD`;
    if (usd >= 1e9) return `$${(usd / 1e9).toFixed(2)}B USD`;
    if (usd >= 1e6) return `$${(usd / 1e6).toFixed(1)}M USD`;
    return `$${Math.round(usd).toLocaleString()} USD`;
  };

  return {
    region_label: classification,
    settlement_classification: classification,
    population_density_km2: popDensity,
    regional_gdp_per_capita_usd: gdpPerCap,
    displaced_population: Math.min(7_800_000_000, displaced_population),
    estimated_casualties: Math.min(7_800_000_000, estimated_casualties),
    infrastructure_loss_usd,
    infrastructure_loss_formatted: formatUsd(infrastructure_loss_usd),
    affected_area_km2: Math.round(affectedAreaKm2),
  };
}

/**
 * Pure, deterministic asteroid impact physics calculation.
 * Combines kinetic energy, TNT, crater, blast, and Mw formulas
 * with Collins, Melosh & Marcus (2005) atmospheric ram-pressure breakup,
 * Pi-group simple vs. complex crater scaling, oblique elliptical crater geometry,
 * USGS elevation, and socioeconomic casualty/infrastructure loss modeling.
 */
export function calculateImpactPhysics(params: ImpactParameters): ImpactSimulationResult {
  const diameter_m = Math.max(0.1, Number(params.diameter_m) || 0);
  const velocity_km_s = Math.max(1, Number(params.velocity_km_s) || 0);
  const angle_deg = Math.max(5, Math.min(90, Number(params.angle_deg) || 45));
  const composition = params.composition || 'stony';
  const compSpec = COMPOSITIONS[composition] || COMPOSITIONS.stony;
  const density = params.custom_density_kg_m3 || compSpec.densityKgM3;
  const targetDensity = params.target_density_kg_m3 || 2700;
  const is_ocean_impact = targetDensity <= 1500;
  const targetLat = params.target_lat ?? 35.03;
  const targetLon = params.target_lon ?? -111.02;
  const terrain_elevation_m =
    params.terrain_elevation_m !== undefined
      ? params.terrain_elevation_m
      : estimateTerrainElevationM(targetLat, targetLon, is_ocean_impact);

  // 1. Geometry & Mass
  const radius_m = diameter_m / 2.0;
  const volume_m3 = (4.0 / 3.0) * Math.PI * Math.pow(radius_m, 3);
  const mass_kg = density * volume_m3;

  // 2. Kinetic Energy (E = 1/2 m v^2)
  const v_m_s = velocity_km_s * 1000.0;
  const energy_j = 0.5 * mass_kg * v_m_s * v_m_s;

  // 3. TNT Equivalents (1 ton TNT = 4.184e9 J; 1 kt = 4.184e12 J; 1 Mt = 4.184e15 J)
  const tnt_kilotons = energy_j / 4.184e12;
  const tnt_megatons = tnt_kilotons / 1000.0;
  const hiroshima_multiples = tnt_kilotons / 15.0;
  const tsar_bomba_multiples = tnt_megatons / 50.0;

  // 4. Atmospheric Entry & Ram Pressure Breakup (Chyba et al. 1993 / Collins, Melosh & Marcus 2005 Eq. 14-18)
  const strength_Pa = compSpec.strengthMPa * 1e6;
  const angle_rad = (angle_deg * Math.PI) / 180.0;
  const sinTheta = Math.sin(angle_rad);
  const scaleHeightM = 8000.0;

  const ramPressureSeaLevel = 1.225 * v_m_s * v_m_s;
  let breakup_altitude_km = 0;
  let is_airburst = false;
  let burst_altitude_km = 0;

  if (ramPressureSeaLevel > strength_Pa) {
    const z_star_m = scaleHeightM * Math.log(ramPressureSeaLevel / strength_Pa);
    breakup_altitude_km = Math.max(0, z_star_m / 1000.0);

    const rho_star = strength_Pa / (v_m_s * v_m_s);
    const dispersion_length_m =
      diameter_m * sinTheta * Math.sqrt(density / (2.0 * Math.max(1e-5, rho_star)));
    const f_p = 7.0; // Pancake factor at maximum energy deposition (Collins et al. 2005)
    const z_burst_m =
      z_star_m -
      2.0 *
        scaleHeightM *
        Math.log(1.0 + (dispersion_length_m / (2.0 * scaleHeightM)) * Math.sqrt(f_p * f_p - 1.0));

    if (
      (z_burst_m > 0 && diameter_m < 110 && composition !== 'iron') ||
      (z_burst_m > 3000 && diameter_m <= 12 && composition === 'iron')
    ) {
      is_airburst = true;
      burst_altitude_km = Math.max(5.5, z_burst_m / 1000.0);
    }
  }

  if (!is_airburst && ((diameter_m < 12 && composition !== 'iron') || diameter_m <= 6)) {
    is_airburst = true;
    if (breakup_altitude_km <= 0) {
      breakup_altitude_km = composition === 'iron' ? 24.5 : 38.0;
    }
    burst_altitude_km = Math.max(
      14.0,
      breakup_altitude_km - Math.max(2.5, diameter_m * 0.65 * sinTheta)
    );
  }

  // 5. Crater Scaling & Oblique Elliptical Geometry (Gault / Bottke / Melosh)
  const diameter_km = diameter_m / 1000.0;

  function estimateOriginalCraterKm(d_km: number, v_kms: number): number {
    if (d_km <= 0) return 0.0;
    if (d_km < 0.05) {
      return Math.max(0.001, d_km * 14.5 * Math.pow(v_kms / 20.0, 0.33));
    }
    const base_mult = 12.0;
    const diam_factor = Math.log10(d_km + 1.0) * 4.0;
    const vel_factor_local = v_kms > 0 ? Math.pow(v_kms / 20.0, 0.5) : 1.0;
    let mult = base_mult + diam_factor * vel_factor_local;
    mult = Math.max(3.0, Math.min(mult, 45.0));
    return Math.max(0.001, d_km * mult);
  }

  const densityFactor = Math.pow(density / targetDensity, 1 / 3);
  const angleFactor = Math.pow(sinTheta, 1 / 3);
  const rawCraterKm =
    estimateOriginalCraterKm(diameter_km, velocity_km_s) *
    densityFactor *
    (angleFactor / Math.pow(Math.sin(Math.PI / 4), 1 / 3));

  const crater_km = is_airburst ? 0 : rawCraterKm;

  // Oblique impact ellipticity: impacts <= 45° elongate downrange; < 25° become pronounced ellipses
  const crater_ellipticity =
    is_airburst
      ? 1.0
      : angle_deg < 48
      ? Number((1.0 + Math.pow((48 - angle_deg) / 38, 1.35) * 0.58).toFixed(2))
      : 1.0;
  const crater_minor_axis_km = crater_km;
  const crater_Major_axis_km = crater_km * crater_ellipticity;

  const crater_depth_km =
    crater_km === 0
      ? 0
      : crater_km < 3.2
      ? crater_km * 0.22
      : 0.35 * Math.pow(crater_km, 0.3);

  // Overturned rim crest height above surrounding pre-impact terrain (Melosh 1989)
  const rim_height_m =
    crater_km === 0
      ? 0
      : crater_km < 3.2
      ? Math.round(crater_km * 1000 * 0.042)
      : Math.round(Math.pow(crater_km, 0.52) * 88);

  // 6. Scientifically Accurate Impact Regime & Crater Morphology Classification
  let impact_regime: ImpactRegimeType = 'simple_crater';
  let crater_morphology: ImpactSimulationResult['crater_morphology'] = 'simple_bowl';

  if (is_airburst) {
    impact_regime = 'airburst';
    crater_morphology = 'none';
  } else if (diameter_m >= 3000 || tnt_megatons >= 500000) {
    impact_regime = 'crust_melt_extinction';
    crater_morphology = 'planetary_melt_basin';
  } else if (is_ocean_impact) {
    impact_regime = 'ocean_tsunami';
    crater_morphology = 'ocean_cavity';
  } else if (crater_km >= 3.2) {
    impact_regime = 'complex_crater';
    crater_morphology = 'complex_terraced';
  } else {
    impact_regime = 'simple_crater';
    crater_morphology = 'simple_bowl';
  }

  // Deep-water tsunami wave amplitude (Ward & Asphaug 2000 scaling)
  const tsunami_wave_height_m =
    is_ocean_impact && !is_airburst
      ? Math.min(1200, Math.round(Math.max(4, Math.pow(tnt_megatons, 0.38) * 14.5) * 10) / 10)
      : 0;

  // Oblique downrange & bilateral butterfly ejecta blanket asymmetry
  const ejecta_butterfly_asymmetry =
    angle_deg < 48 ? Math.min(1, Math.max(0, (48 - angle_deg) / 38)) : 0;
  const downrange_ejecta_reach_km = is_airburst
    ? 0
    : Number((crater_Major_axis_km * (2.15 + ejecta_butterfly_asymmetry * 1.45)).toFixed(2));

  // 7. Fireball, Thermal Radiation & Overpressure Blast Rings (Glasstone & Dolan / Collins 2005)
  const fireball_km = Math.max(0.02, (0.002 * Math.pow(energy_j, 1 / 3)) / 1000.0);
  const w_kt_pow = Math.pow(Math.max(0.001, tnt_kilotons), 1 / 3);
  const severe_blast_km = Math.max(0.1, 0.28 * w_kt_pow);
  const moderate_blast_km = Math.max(0.25, 0.72 * w_kt_pow);
  const thermal_burn_km = Math.max(0.2, 0.55 * Math.pow(Math.max(0.001, tnt_kilotons), 0.41));
  const airblast_1psi_km = Math.max(0.5, 2.2 * w_kt_pow);
  const blast_km = Math.max(airblast_1psi_km, rawCraterKm * 3.0);

  // 8. Equivalent Earthquake Magnitude Mw
  const equivalent_earthquake_Mw =
    energy_j > 0 ? Math.max(0, (Math.log10(energy_j) - 4.8) / 1.5) : 0.0;

  // 9. Socioeconomic Population & GDP Infrastructure Exposure
  const socioeconomic = calculateSocioeconomicImpact(
    targetLat,
    targetLon,
    is_ocean_impact,
    severe_blast_km,
    moderate_blast_km,
    blast_km,
    thermal_burn_km,
    tsunami_wave_height_m
  );

  // 10. Ballistic Ejecta Re-Entry & Global/Continental Firestorm Ignition Model (Melosh et al. 1990 / Robertson et al. 2013)
  let firestorm_regime: FirestormRegimeType = 'none';
  let firestorm_label = 'No Re-Entry Firestorm';
  let firestorm_coverage_pct = 0;

  if (!is_airburst && (tnt_megatons >= 250000 || diameter_m >= 2500)) {
    firestorm_regime = 'global_firestorm_envelope';
    firestorm_coverage_pct = Math.min(
      100,
      Math.max(68, Math.round(68 + Math.log10(Math.max(1, tnt_megatons / 250000)) * 18))
    );
    firestorm_label = `Global Firestorm Envelope (${firestorm_coverage_pct}% Planetary Coverage)`;
  } else if (!is_airburst && (tnt_megatons >= 3200 || diameter_m >= 420)) {
    firestorm_regime = 'continental_firestorm';
    firestorm_coverage_pct = Math.min(
      55,
      Math.max(14, Math.round(14 + Math.log10(Math.max(1, tnt_megatons / 3200)) * 18))
    );
    firestorm_label = `Continental Re-Entry Firestorm (${firestorm_coverage_pct}% Hemisphere)`;
  } else if (!is_airburst && tnt_megatons >= 15) {
    firestorm_regime = 'local_thermal_ignition';
    firestorm_coverage_pct = Math.min(10, Math.max(2, Math.round((thermal_burn_km / 600) * 8)));
    firestorm_label = `Regional Thermal Ignition (${thermal_burn_km.toFixed(0)} km Radius)`;
  }

  // 11. Torino Scale & Severity Classification
  let torino_scale = 0;
  let severity_label = 'Harmless Upper-Atmosphere Bolide';
  if (tnt_megatons >= 1000000) {
    torino_scale = 10;
    severity_label = 'Global Mass Extinction Event (Class 10)';
  } else if (tnt_megatons >= 10000) {
    torino_scale = 9;
    severity_label = 'Sub-Global Climatic Catastrophe (Class 9)';
  } else if (tnt_megatons >= 100) {
    torino_scale = 8;
    severity_label = 'Continental / Regional Devastation (Class 8)';
  } else if (tnt_megatons >= 1) {
    torino_scale = 6;
    severity_label = 'Metropolitan / Regional Airburst Threat (Class 6)';
  } else if (tnt_kilotons >= 10) {
    torino_scale = 4;
    severity_label = 'Localized Shockwave & Acoustic Hazard (Class 4)';
  } else {
    torino_scale = 1;
    severity_label = 'Atmospheric Fireball / Meteorite Fall (Class 1)';
  }

  let closestBenchmark = HISTORICAL_BENCHMARKS[0];
  let minLogDiff = Infinity;
  for (const b of HISTORICAL_BENCHMARKS) {
    const diff = Math.abs(Math.log10(Math.max(1e-6, tnt_megatons)) - Math.log10(b.megatons));
    if (diff < minLogDiff) {
      minLogDiff = diff;
      closestBenchmark = b;
    }
  }

  return {
    diameter_m,
    velocity_km_s,
    angle_deg,
    composition,
    density_kg_m3: density,
    mass_kg,
    energy_j,
    tnt_kilotons,
    tnt_megatons,
    hiroshima_multiples,
    tsar_bomba_multiples,
    crater_km,
    crater_Major_axis_km,
    crater_minor_axis_km,
    crater_ellipticity,
    crater_depth_km,
    rim_height_m,
    terrain_elevation_m,
    fireball_km,
    severe_blast_km,
    moderate_blast_km,
    thermal_burn_km,
    blast_km,
    equivalent_earthquake_Mw,
    is_airburst,
    breakup_altitude_km,
    burst_altitude_km,
    torino_scale,
    severity_label,
    impact_regime,
    crater_morphology,
    is_ocean_impact,
    tsunami_wave_height_m,
    ejecta_butterfly_asymmetry,
    downrange_ejecta_reach_km,
    yield_strength_mpa: compSpec.strengthMPa,
    firestorm_regime,
    firestorm_label,
    firestorm_coverage_pct,
    socioeconomic,
    closest_benchmark: closestBenchmark,
    notes: is_airburst
      ? `Atmospheric ram pressure (${(ramPressureSeaLevel / 1e6).toFixed(1)} MPa) exceeds yield strength (${compSpec.strengthMPa} MPa). Impactor fragments at ${breakup_altitude_km.toFixed(1)} km and detonates as a terminal airburst at ${burst_altitude_km.toFixed(1)} km altitude with zero surface crater.`
      : is_ocean_impact
      ? `Hypervelocity oceanic impact excavates a ${crater_km.toFixed(2)} km transient acoustic water cavity and generates ~${tsunami_wave_height_m.toFixed(0)} m deep-water tsunami wave rings.`
      : impact_regime === 'crust_melt_extinction'
      ? `Planetary-scale impactor (${diameter_km.toFixed(1)} km) excavates a ${crater_Major_axis_km.toFixed(1)} × ${crater_minor_axis_km.toFixed(1)} km multi-ring melt basin, blasts exospheric melt droplets into space, and triggers a ${firestorm_label.toLowerCase()}.`
      : `Impactor penetrates atmosphere at ${angle_deg}° and excavates a ${crater_Major_axis_km.toFixed(2)} × ${crater_minor_axis_km.toFixed(2)} km ${crater_ellipticity > 1.05 ? `elliptical (e=${crater_ellipticity.toFixed(2)}) ` : ''}${crater_km >= 3.2 ? 'complex terraced peak-ring' : 'simple bowl'} crater (${crater_depth_km.toFixed(2)} km deep, +${rim_height_m}m rim) with ${downrange_ejecta_reach_km.toFixed(1)} km downrange ejecta.`,
  };
}

/**
 * Computes instantaneous atmospheric entry physics telemetry at any point
 * along the 5.5-second approach trajectory (`approachProgress` in [0, 1]).
 */
export function calculateAtmosphericEntryState(
  approachProgress: number,
  result: ImpactSimulationResult
): AtmosphericEntryTelemetry {
  const clampedProg = Math.max(0, Math.min(1, approachProgress));
  const ATMOSPHERE_ENTRY_SPLIT = 0.62;
  const yieldStrengthMPa = result.yield_strength_mpa || COMPOSITIONS[result.composition].strengthMPa;

  if (clampedProg < ATMOSPHERE_ENTRY_SPLIT) {
    const spaceFrac = clampedProg / ATMOSPHERE_ENTRY_SPLIT;
    const altitudeKm = 120 + Math.pow(1 - spaceFrac, 1.8) * 3480;
    return {
      altitudeKm,
      atmosphericLayer: 'Deep Space Vacuum',
      densityKgM3: 0,
      ramPressureMPa: 0,
      yieldStrengthMPa,
      overpressureRatio: 0,
      isInAtmosphere: false,
      isFragmenting: false,
      isTerminalBurst: false,
      pancakeFactor: 1.0,
      remainingMassPct: 100,
      activeFragmentCount: 1,
      plasmaIntensity: 0,
      currentVelocityKms: result.velocity_km_s,
    };
  }

  const atmFrac = (clampedProg - ATMOSPHERE_ENTRY_SPLIT) / (1 - ATMOSPHERE_ENTRY_SPLIT);
  const terminalAltKm = result.is_airburst ? Math.max(6, result.burst_altitude_km) : 0;
  const altitudeKm = Math.max(
    terminalAltKm,
    120 * (1 - atmFrac) + terminalAltKm * atmFrac
  );

  let atmosphericLayer: AtmosphericEntryTelemetry['atmosphericLayer'] = 'Thermosphere';
  if (altitudeKm <= 12) {
    atmosphericLayer = 'Troposphere';
  } else if (altitudeKm <= 50) {
    atmosphericLayer = 'Stratosphere';
  } else if (altitudeKm <= 85) {
    atmosphericLayer = 'Mesosphere';
  }

  const densityKgM3 = 1.225 * Math.exp(-altitudeKm / 8.0);

  const dragDecelFactor = result.is_airburst
    ? 1 - Math.pow(atmFrac, 2.4) * 0.42
    : 1 - Math.pow(atmFrac, 2.8) * Math.min(0.18, 12 / Math.max(10, result.diameter_m));
  const currentVelocityKms = Math.max(3.5, result.velocity_km_s * dragDecelFactor);
  const vMs = currentVelocityKms * 1000;

  const ramPressureMPa = (densityKgM3 * vMs * vMs) / 1e6;
  const overpressureRatio = ramPressureMPa / Math.max(0.05, yieldStrengthMPa);

  const canFragment =
    result.breakup_altitude_km > 0 &&
    result.composition !== 'iron' &&
    result.diameter_m < 2500;
  const isFragmenting = canFragment && altitudeKm <= result.breakup_altitude_km;

  let pancakeFactor = 1.0;
  let activeFragmentCount = 1;
  if (isFragmenting) {
    const spanKm = Math.max(6, result.breakup_altitude_km - terminalAltKm);
    const fragProgress = Math.max(
      0,
      Math.min(1, (result.breakup_altitude_km - altitudeKm) / spanKm)
    );
    const maxSpread =
      result.composition === 'ice'
        ? 2.6
        : result.composition === 'porous_rock'
        ? 2.1
        : 1.65;
    pancakeFactor = 1.0 + Math.pow(fragProgress, 1.25) * (maxSpread - 1.0);
    activeFragmentCount = Math.min(12, 2 + Math.floor(fragProgress * 10));
  }

  const maxAblationLossPct = result.is_airburst
    ? result.composition === 'ice'
      ? 96
      : 88
    : result.composition === 'iron'
    ? 6
    : Math.min(48, 1200 / Math.max(15, result.diameter_m));
  const remainingMassPct = Math.max(
    2,
    100 - Math.pow(atmFrac, 1.7) * maxAblationLossPct
  );

  const plasmaIntensity = Math.min(
    1.0,
    Math.pow(atmFrac, 0.65) * Math.min(1.3, currentVelocityKms / 18)
  );

  const isTerminalBurst = result.is_airburst && atmFrac >= 0.94;

  return {
    altitudeKm,
    atmosphericLayer,
    densityKgM3,
    ramPressureMPa,
    yieldStrengthMPa,
    overpressureRatio,
    isInAtmosphere: true,
    isFragmenting,
    isTerminalBurst,
    pancakeFactor,
    remainingMassPct,
    activeFragmentCount,
    plasmaIntensity,
    currentVelocityKms,
  };
}

/**
 * Planetary Defense Deflection Physics (NASA DART Kinetic Impactor / Gravity Tractor / Stand-off Nuclear)
 */
export function calculateDeflectionPhysics(params: DeflectionParameters): DeflectionResult {
  const diameter_m = Math.max(5, params.diameter_m);
  const density = COMPOSITIONS[params.composition]?.densityKgM3 || 3000;
  const radius_m = diameter_m / 2.0;
  const asteroid_mass_kg = (4.0 / 3.0) * Math.PI * Math.pow(radius_m, 3) * density;

  const warning_seconds = params.warning_years * 365.25 * 86400;
  const earth_radius_km = 6371.0;
  const safe_threshold_km = earth_radius_km * 1.5;

  let delta_v_mm_s = 0;

  if (params.method === 'kinetic_impactor') {
    const imp_mass_kg = params.impactor_mass_kg;
    const v_rel_m_s = params.relative_impact_vel_km_s * 1000.0;
    const beta = params.beta_factor;
    const delta_v_m_s = (beta * imp_mass_kg * v_rel_m_s) / asteroid_mass_kg;
    delta_v_mm_s = delta_v_m_s * 1000.0;
  } else if (params.method === 'gravity_tractor') {
    const tractor_mass_kg = params.impactor_mass_kg;
    const hover_distance_m = radius_m * 1.6 + 50;
    const G = 6.6743e-11;
    const accel_m_s2 = (G * tractor_mass_kg) / (hover_distance_m * hover_distance_m);
    const delta_v_m_s = accel_m_s2 * warning_seconds * 0.65;
    delta_v_mm_s = delta_v_m_s * 1000.0;
  } else if (params.method === 'nuclear_standoff') {
    const effective_impulse_n_s = params.impactor_mass_kg * 4.5e5 * params.beta_factor;
    const delta_v_m_s = effective_impulse_n_s / asteroid_mass_kg;
    delta_v_mm_s = delta_v_m_s * 1000.0;
  }

  const secular_amplification = 3.0;
  const deflected_distance_km =
    (delta_v_mm_s / 1e6) * warning_seconds * secular_amplification;

  const earth_radii_clearance = deflected_distance_km / earth_radius_km;
  const status =
    deflected_distance_km >= safe_threshold_km
      ? 'DEFLECTED'
      : deflected_distance_km >= earth_radius_km
        ? 'GRAZING_RISK'
        : 'IMPACT_LOCKED';

  return {
    asteroid_mass_kg,
    delta_v_mm_s,
    deflected_distance_km,
    earth_radii_clearance,
    safe_threshold_km,
    status,
    summary:
      status === 'DEFLECTED'
        ? `Mission Success: Δv of ${delta_v_mm_s.toFixed(2)} mm/s applied ${params.warning_years.toFixed(1)} yrs before encounter shifts trajectory by ${deflected_distance_km.toFixed(0)} km (${earth_radii_clearance.toFixed(2)} R⊕).`
        : `Insufficient Deflection: Δv of ${delta_v_mm_s.toFixed(2)} mm/s only shifts trajectory by ${deflected_distance_km.toFixed(0)} km (${earth_radii_clearance.toFixed(2)} R⊕). Increase lead time or payload mass.`,
  };
}

export function formatLargeNumber(val: number): string {
  if (!Number.isFinite(val)) return '0';
  if (val >= 1e12) return `${(val / 1e12).toFixed(2)}T`;
  if (val >= 1e9) return `${(val / 1e9).toFixed(2)}B`;
  if (val >= 1e6) return `${(val / 1e6).toFixed(2)}M`;
  if (val >= 1e4) return `${(val / 1e3).toFixed(1)}k`;
  if (val >= 100) return val.toFixed(1);
  return val.toFixed(2);
}



