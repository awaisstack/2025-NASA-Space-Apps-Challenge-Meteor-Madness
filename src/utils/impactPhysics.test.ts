import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateImpactPhysics,
  calculateDeflectionPhysics,
  estimateTerrainElevationM,
} from './impactPhysics';

test('5m stony asteroid triggers upper-atmosphere airburst with zero ground crater', () => {
  const res = calculateImpactPhysics({
    diameter_m: 5,
    velocity_km_s: 20,
    angle_deg: 45,
    composition: 'stony',
    target_density_kg_m3: 2700,
    target_lat: 35.03,
    target_lon: -111.02,
  });

  assert.equal(res.is_airburst, true);
  assert.equal(res.impact_regime, 'airburst');
  assert.equal(res.crater_km, 0);
  assert.equal(res.crater_depth_km, 0);
  assert.ok(res.burst_altitude_km > 20, `Expected burst altitude > 20km, got ${res.burst_altitude_km}`);
});

test('Variable composition: 45m Campo del Cielo Iron Core excavates ground crater while 45m Bennu Rubble-Pile airbursts', () => {
  const bennuPorous = calculateImpactPhysics({
    diameter_m: 45,
    velocity_km_s: 20,
    angle_deg: 45,
    composition: 'porous_rock',
    target_density_kg_m3: 2700,
  });

  const campoIron = calculateImpactPhysics({
    diameter_m: 45,
    velocity_km_s: 20,
    angle_deg: 45,
    composition: 'iron',
    target_density_kg_m3: 2700,
  });

  assert.equal(bennuPorous.is_airburst, true);
  assert.equal(bennuPorous.crater_km, 0);

  assert.equal(campoIron.is_airburst, false);
  assert.ok(campoIron.crater_km > 0.8, `Expected iron crater > 0.8km, got ${campoIron.crater_km}`);
  assert.ok(campoIron.energy_j > bennuPorous.energy_j * 5);
});

test('Geological Realism: Oblique impact produces elliptical crater geometry and asymmetrical downrange ejecta', () => {
  const oblique = calculateImpactPhysics({
    diameter_m: 300,
    velocity_km_s: 25,
    angle_deg: 25,
    composition: 'stony',
    target_density_kg_m3: 2700,
    target_lat: 35.03,
    target_lon: -111.02,
  });

  assert.ok(oblique.crater_ellipticity > 1.15);
  assert.ok(oblique.crater_Major_axis_km > oblique.crater_minor_axis_km);
  assert.ok(oblique.ejecta_butterfly_asymmetry > 0.3);
  assert.ok(oblique.downrange_ejecta_reach_km > oblique.crater_Major_axis_km * 1.5);
  assert.ok(oblique.rim_height_m > 50);
});

test('Socioeconomic & USGS Elevation: 59.2°N, -113.5°W Boreal Shield vs Tokyo Bay Megacity', () => {
  const boreal = calculateImpactPhysics({
    diameter_m: 300,
    velocity_km_s: 25,
    angle_deg: 45,
    composition: 'stony',
    target_density_kg_m3: 2700,
    target_lat: 59.2,
    target_lon: -113.5,
  });

  const tokyo = calculateImpactPhysics({
    diameter_m: 300,
    velocity_km_s: 25,
    angle_deg: 45,
    composition: 'stony',
    target_density_kg_m3: 1025,
    target_lat: 35.62,
    target_lon: 139.78,
  });

  assert.ok(boreal.terrain_elevation_m > 100);
  assert.ok(boreal.socioeconomic.region_label.includes('59.2°N'));
  assert.ok(tokyo.socioeconomic.displaced_population > boreal.socioeconomic.displaced_population * 50);
  assert.ok(tokyo.socioeconomic.infrastructure_loss_usd > boreal.socioeconomic.infrastructure_loss_usd * 50);
  assert.ok(estimateTerrainElevationM(35.03, -111.02, false) > 1000);
});

test('Planetary Defense DART Interception: Lead warning years amplify B-plane miss distance', () => {
  const lateIntercept = calculateDeflectionPhysics({
    diameter_m: 300,
    composition: 'stony',
    warning_years: 1,
    impactor_mass_kg: 2000,
    relative_impact_vel_km_s: 12,
    beta_factor: 3.6,
    method: 'kinetic_impactor',
  });

  const earlyIntercept = calculateDeflectionPhysics({
    diameter_m: 300,
    composition: 'stony',
    warning_years: 15,
    impactor_mass_kg: 2000,
    relative_impact_vel_km_s: 12,
    beta_factor: 3.6,
    method: 'kinetic_impactor',
  });

  assert.equal(lateIntercept.delta_v_mm_s, earlyIntercept.delta_v_mm_s);
  assert.ok(earlyIntercept.deflected_distance_km > lateIntercept.deflected_distance_km * 10);
});
