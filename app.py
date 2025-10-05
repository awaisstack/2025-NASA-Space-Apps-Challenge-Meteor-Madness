# app.py
import os
import math
import time
from flask import Flask, request, jsonify, send_from_directory
import requests

app = Flask(__name__, static_folder='static', static_url_path='/static')

NASA_API_KEY = os.environ.get('NASA_API_KEY') or 'XcfRGmAVweB9xUbfOoVRDW4jw2PT19RykF4cb8bO'

NEO_FEED_URL = "https://api.nasa.gov/neo/rest/v1/feed"
NEO_BROWSE_URL = "https://api.nasa.gov/neo/rest/v1/neo/browse"
NEO_LOOKUP_URL = "https://api.nasa.gov/neo/rest/v1/neo/{}"

_cache = {"neos": None, "expires": 0, "source": None, "cache_key": None}

def normalize_neo_object(o):
    est_min = o.get("estimated_diameter", {}).get("meters", {}).get("estimated_diameter_min")
    est_max = o.get("estimated_diameter", {}).get("meters", {}).get("estimated_diameter_max")
    est_avg = None
    if est_min is not None and est_max is not None:
        est_avg = (est_min + est_max) / 2.0

    vel = None
    cad = o.get("close_approach_data")
    if cad and isinstance(cad, list) and len(cad) > 0:
        try:
            vel = float(cad[0].get("relative_velocity", {}).get("kilometers_per_second"))
        except Exception:
            vel = None

    return {
        "id": o.get("id") or o.get("neo_reference_id"),
        "name": o.get("name"),
        "is_potentially_hazardous": o.get("is_potentially_hazardous_asteroid", False),
        "nasa_jpl_url": o.get("nasa_jpl_url"),
        "est_diameter_m_avg": est_avg,
        "est_diameter_m_min": est_min,
        "est_diameter_m_max": est_max,
        "est_velocity_km_s": vel
    }

@app.after_request
def add_cors_headers(resp):
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type,Authorization"
    resp.headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS"
    return resp

@app.route('/api/neos')
def api_neos():
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')

    use_feed = bool(start_date and end_date)
    now = time.time()
    cache_key = ("feed", start_date, end_date) if use_feed else ("browse", None, None)

    if _cache["neos"] is not None and _cache.get("cache_key") == cache_key and _cache["expires"] > now:
        return jsonify({"source": _cache["source"], "count": len(_cache["neos"]), "neos": _cache["neos"]})

    try:
        if use_feed:
            params = {'api_key': NASA_API_KEY, 'start_date': start_date, 'end_date': end_date}
            r = requests.get(NEO_FEED_URL, params=params, timeout=10)
            r.raise_for_status()
            feed = r.json()
            neo_dict = feed.get('near_earth_objects', {}) or {}
            flat = []
            for d, arr in neo_dict.items():
                for o in arr:
                    flat.append(normalize_neo_object(o))
            _cache.update({"neos": flat, "expires": now + 60, "source": "feed", "cache_key": cache_key})
            return jsonify({"source": "feed", "count": len(flat), "neos": flat})
        else:
            params = {'api_key': NASA_API_KEY}
            r = requests.get(NEO_BROWSE_URL, params=params, timeout=10)
            r.raise_for_status()
            jb = r.json()
            arr = jb.get('near_earth_objects', []) or []
            simplified = [normalize_neo_object(o) for o in arr]
            _cache.update({"neos": simplified, "expires": now + 60, "source": "browse", "cache_key": cache_key})
            return jsonify({"source": "browse", "count": len(simplified), "neos": simplified})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/neo/<neo_id>')
def api_neo_lookup(neo_id):
    try:
        url = NEO_LOOKUP_URL.format(neo_id)
        r = requests.get(url, params={'api_key': NASA_API_KEY}, timeout=10)
        r.raise_for_status()
        return jsonify(r.json())
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/impact', methods=['POST'])
def api_impact():
    try:
        data = request.get_json() or {}
        diameter_m = float(data.get('diameter_m') or 0.0)
        velocity_km_s = float(data.get('velocity_km_s') or 0.0)

        # basic physical assumptions
        density = 3000.0  # kg/m3 typical stony asteroid
        r = diameter_m / 2.0
        volume = (4.0/3.0) * math.pi * (r**3)
        mass = density * volume
        v = velocity_km_s * 1000.0  # m/s
        energy_j = 0.5 * mass * v * v

        # TNT equivalent
        tnt_kilotons = energy_j / 4.184e12
        tnt_megatons = tnt_kilotons / 1000.0

        # -----------------------
        # Improved empirical crater estimator
        # - More realistic than a fixed multiplier.
        # - Conservative and deterministic for UI visualizations.
        # - For production-grade accuracy, implement Collins/Holsapple pi-scaling.
        # -----------------------
        diameter_km = diameter_m / 1000.0
        # typical Earth gravity and target density (rock)
        g = 9.81
        rho_target = 2700.0

        def estimate_crater_km(d_km, v_kms, rho_i=3000.0):
            """
            Empirical scaling function:
            - for tiny impactors (<~50 m) scale down (strength regime).
            - for medium/large impactors use a diameter-dependent multiplier
              that grows slowly with size and with sqrt(velocity) influence.
            - clamps multiplier to keep results visually stable.
            """
            if d_km <= 0:
                return 0.0

            # tiny objects: avoid overestimating tiny craters
            if d_km < 0.05:
                # micro / strength-influenced regime; velocity has small effect
                return max(0.001, d_km * 0.6 * (v_kms / 20.0) ** 0.25)

            # baseline multiplier for mid-size objects
            base_mult = 12.0

            # diameter-dependent factor (log-based growth)
            diam_factor = math.log10(d_km + 1.0) * 4.0  # grows slowly with size

            # velocity contribution (sqrt-like)
            vel_factor_local = (v_kms / 20.0) ** 0.5 if v_kms > 0 else 1.0

            mult = base_mult + diam_factor * vel_factor_local

            # clamp multiplier to sensible limits to avoid runaway values
            mult = max(3.0, min(mult, 45.0))

            return max(0.001, d_km * mult)

        crater_km = estimate_crater_km(diameter_km, velocity_km_s, density)

        # blast radius (approximate): scaled from crater size to give coherent visuals
        blast_km = max(0.5, crater_km * 3.0)

        # earthquake equivalence (retain your original heuristic)
        Mw = (math.log10(energy_j) - 4.8) / 1.5 if energy_j > 0 else 0.0

        return jsonify({
            'diameter_m': diameter_m,
            'velocity_km_s': velocity_km_s,
            'mass_kg': mass,
            'energy_j': energy_j,
            'tnt_kilotons': tnt_kilotons,
            'tnt_megatons': tnt_megatons,
            'crater_km': crater_km,
            'blast_km': blast_km,
            'equivalent_earthquake_Mw': Mw,
            'notes': 'Approximate empirical crater scaling. For higher fidelity use Collins/Holsapple pi-scaling.'
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 400

# Serve frontend
@app.route('/')
def index():
    return send_from_directory('static', 'index.html')

@app.route('/<path:path>')
def static_proxy(path):
    return send_from_directory('static', path)


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print(f"Starting server on http://0.0.0.0:{port} (NASA_API_KEY set: {'YES' if NASA_API_KEY else 'NO'})")
    app.run(host='0.0.0.0', port=port, debug=True)
