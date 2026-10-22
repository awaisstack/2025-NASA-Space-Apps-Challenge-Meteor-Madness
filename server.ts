import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import {
  calculateImpactPhysics,
  calculateDeflectionPhysics,
  CURATED_NEOS
} from './src/utils/impactPhysics.ts';
import type { NeoObject, CompositionType } from './src/types.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const NASA_API_KEY = process.env.NASA_API_KEY || 'XcfRGmAVweB9xUbfOoVRDW4jw2PT19RykF4cb8bO';
const NEO_FEED_URL = 'https://api.nasa.gov/neo/rest/v1/feed';
const NEO_BROWSE_URL = 'https://api.nasa.gov/neo/rest/v1/neo/browse';
const NEO_LOOKUP_URL = 'https://api.nasa.gov/neo/rest/v1/neo/';

interface CacheState {
  neos: NeoObject[] | null;
  expires: number;
  source: string | null;
  cacheKey: string | null;
}

const cache: CacheState = {
  neos: null,
  expires: 0,
  source: null,
  cacheKey: null,
};

function normalizeNeoObject(o: any): NeoObject {
  const estMin = o?.estimated_diameter?.meters?.estimated_diameter_min;
  const estMax = o?.estimated_diameter?.meters?.estimated_diameter_max;
  let estAvg = 50;
  if (typeof estMin === 'number' && typeof estMax === 'number') {
    estAvg = Math.round((estMin + estMax) / 2.0);
  }

  let vel = 20.0;
  let closeDate = undefined;
  let missDistKm = undefined;
  const cad = o?.close_approach_data;
  if (Array.isArray(cad) && cad.length > 0) {
    const parsedVel = parseFloat(cad[0]?.relative_velocity?.kilometers_per_second);
    if (Number.isFinite(parsedVel)) {
      vel = Number(parsedVel.toFixed(2));
    }
    closeDate = cad[0]?.close_approach_date;
    const parsedMiss = parseFloat(cad[0]?.miss_distance?.kilometers);
    if (Number.isFinite(parsedMiss)) {
      missDistKm = Math.round(parsedMiss);
    }
  }

  return {
    id: String(o?.id || o?.neo_reference_id || Math.random()),
    name: String(o?.name || o?.id || 'Unknown NEO'),
    is_potentially_hazardous: Boolean(o?.is_potentially_hazardous_asteroid),
    nasa_jpl_url: o?.nasa_jpl_url,
    est_diameter_m_avg: estAvg,
    est_diameter_m_min: typeof estMin === 'number' ? Math.round(estMin) : Math.round(estAvg * 0.8),
    est_diameter_m_max: typeof estMax === 'number' ? Math.round(estMax) : Math.round(estAvg * 1.2),
    est_velocity_km_s: vel,
    composition_hint: estAvg > 300 ? 'porous_rock' : 'stony',
    close_approach_date: closeDate,
    miss_distance_km: missDistKm,
  };
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // 1. Live NASA NeoWs API endpoint with resilient curated fallback
  app.get('/api/neos', async (req, res) => {
    const startDate = req.query.start_date as string | undefined;
    const endDate = req.query.end_date as string | undefined;
    const useFeed = Boolean(startDate && endDate);
    const now = Date.now();
    const cacheKey = useFeed ? `feed:${startDate}:${endDate}` : 'browse';

    if (cache.neos && cache.cacheKey === cacheKey && cache.expires > now) {
      return res.json({
        source: cache.source,
        count: cache.neos.length,
        neos: cache.neos,
        items: cache.neos,
      });
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4500);

      let url = `${NEO_BROWSE_URL}?api_key=${encodeURIComponent(NASA_API_KEY)}`;
      if (useFeed && startDate && endDate) {
        url = `${NEO_FEED_URL}?start_date=${encodeURIComponent(startDate)}&end_date=${encodeURIComponent(endDate)}&api_key=${encodeURIComponent(NASA_API_KEY)}`;
      }

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`NASA API responded with HTTP ${response.status}`);
      }

      const data: any = await response.json();
      let liveNeos: NeoObject[] = [];

      if (useFeed) {
        const dict = data?.near_earth_objects || {};
        for (const dateKey of Object.keys(dict)) {
          for (const item of dict[dateKey] || []) {
            liveNeos.push(normalizeNeoObject(item));
          }
        }
      } else {
        const arr = data?.near_earth_objects || [];
        liveNeos = arr.map(normalizeNeoObject);
      }

      // Prepend curated NASA Space Apps scenarios so Impactor-2025, Apophis, Bennu, and DART are always immediately accessible
      const merged = [
        ...CURATED_NEOS,
        ...liveNeos.filter(n => !CURATED_NEOS.some(c => c.id === n.id)),
      ];

      cache.neos = merged;
      cache.expires = now + 120_000;
      cache.source = useFeed ? 'nasa_neows_feed' : 'nasa_neows_live';
      cache.cacheKey = cacheKey;

      return res.json({
        source: cache.source,
        count: merged.length,
        neos: merged,
        items: merged,
      });
    } catch (err) {
      // Fallback seamlessly to curated NASA JPL telemetry
      cache.neos = CURATED_NEOS;
      cache.expires = now + 60_000;
      cache.source = 'curated_jpl_ephemeris';
      cache.cacheKey = cacheKey;

      return res.json({
        source: 'curated_jpl_ephemeris',
        count: CURATED_NEOS.length,
        neos: CURATED_NEOS,
        items: CURATED_NEOS,
      });
    }
  });

  // 2. Single NEO lookup
  app.get('/api/neo/:neo_id', async (req, res) => {
    const { neo_id } = req.params;
    const curated = CURATED_NEOS.find(n => n.id === neo_id);
    if (curated) {
      return res.json(curated);
    }
    try {
      const response = await fetch(`${NEO_LOOKUP_URL}${encodeURIComponent(neo_id)}?api_key=${encodeURIComponent(NASA_API_KEY)}`);
      if (!response.ok) {
        return res.status(response.status).json({ error: `NEO ${neo_id} lookup failed` });
      }
      const data = await response.json();
      return res.json(normalizeNeoObject(data));
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || 'NEO lookup failed' });
    }
  });

  // 3. Impact Physics Simulation Endpoint (compatible with original app.py POST /api/impact + extended parameters)
  app.post('/api/impact', (req, res) => {
    try {
      const body = req.body || {};
      const diameter_m = Number(body.diameter_m) || 50;
      const velocity_km_s = Number(body.velocity_km_s) || 20;
      const angle_deg = Number(body.angle_deg) || 45;
      const composition: CompositionType = body.composition || 'stony';
      const target_density_kg_m3 = Number(body.target_density_kg_m3) || 2700;

      const result = calculateImpactPhysics({
        diameter_m,
        velocity_km_s,
        angle_deg,
        composition,
        target_density_kg_m3,
      });

      return res.json(result);
    } catch (err: any) {
      return res.status(400).json({ error: err?.message || 'Impact calculation failed' });
    }
  });

  // 4. Planetary Defense Deflection Endpoint
  app.post('/api/deflect', (req, res) => {
    try {
      const body = req.body || {};
      const result = calculateDeflectionPhysics({
        diameter_m: Number(body.diameter_m) || 300,
        composition: body.composition || 'stony',
        warning_years: Number(body.warning_years) || 5,
        impactor_mass_kg: Number(body.impactor_mass_kg) || 2000,
        relative_impact_vel_km_s: Number(body.relative_impact_vel_km_s) || 12,
        beta_factor: Number(body.beta_factor) || 3.6,
        method: body.method || 'kinetic_impactor',
      });
      return res.json(result);
    } catch (err: any) {
      return res.status(400).json({ error: err?.message || 'Deflection calculation failed' });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ImpactScope Planetary Defense Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
