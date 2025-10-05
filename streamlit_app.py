# streamlit_app.py
import streamlit as st
import requests
import math
import os
import time

NASA_API_KEY = os.environ.get('NASA_API_KEY') or 'XcfRGmAVweB9xUbfOoVRDW4jw2PT19RykF4cb8bO'
NEO_BROWSE_URL = "https://api.nasa.gov/neo/rest/v1/neo/browse"
NEO_LOOKUP_URL = "https://api.nasa.gov/neo/rest/v1/neo/{}"

st.set_page_config(page_title="🌠 Meteor Madness — NASA Space Apps", layout="wide")

st.title("🌎 Meteor Madness — NASA Space Apps Challenge 2025")
st.markdown("Simulate asteroid impacts using real NASA NEO data 🚀")

# --------------------------
# Section 1: NEO Browser
# --------------------------
st.header("🛰️ Browse Near-Earth Objects (NASA NEO API)")

if st.button("Fetch Latest NEO Data"):
    with st.spinner("Fetching from NASA API..."):
        try:
            r = requests.get(NEO_BROWSE_URL, params={'api_key': NASA_API_KEY}, timeout=10)
            r.raise_for_status()
            data = r.json().get("near_earth_objects", [])
            st.success(f"Fetched {len(data)} objects successfully ✅")

            for obj in data[:10]:
                name = obj.get("name")
                est = obj.get("estimated_diameter", {}).get("meters", {})
                vel = None
                cad = obj.get("close_approach_data", [])
                if cad and len(cad) > 0:
                    try:
                        vel = float(cad[0].get("relative_velocity", {}).get("kilometers_per_second"))
                    except Exception:
                        vel = None

                st.write(f"**🪐 {name}**")
                st.write(f"Diameter: {est.get('estimated_diameter_min', 0):.2f}–{est.get('estimated_diameter_max', 0):.2f} m")
                if vel:
                    st.write(f"Velocity: {vel:.2f} km/s")
                st.divider()
        except Exception as e:
            st.error(f"Failed to fetch data: {e}")

# --------------------------
# Section 2: Impact Simulator
# --------------------------
st.header("💥 Meteor Impact Simulator")

diameter_m = st.number_input("Asteroid Diameter (meters)", value=100.0, min_value=1.0)
velocity_km_s = st.number_input("Velocity (km/s)", value=20.0, min_value=0.1)
density = 3000.0  # kg/m3

if st.button("Simulate Impact"):
    r = diameter_m / 2.0
    volume = (4.0 / 3.0) * math.pi * (r ** 3)
    mass = density * volume
    v = velocity_km_s * 1000.0  # m/s
    energy_j = 0.5 * mass * v * v
    tnt_megatons = energy_j / 4.184e15

    # crater estimate
    diameter_km = diameter_m / 1000.0
    def estimate_crater_km(d_km, v_kms):
        if d_km < 0.05:
            return max(0.001, d_km * 0.6 * (v_kms / 20.0) ** 0.25)
        base_mult = 12.0
        diam_factor = math.log10(d_km + 1.0) * 4.0
        vel_factor = (v_kms / 20.0) ** 0.5
        mult = max(3.0, min(base_mult + diam_factor * vel_factor, 45.0))
        return max(0.001, d_km * mult)

    crater_km = estimate_crater_km(diameter_km, velocity_km_s)
    blast_km = crater_km * 3.0
    Mw = (math.log10(energy_j) - 4.8) / 1.5 if energy_j > 0 else 0.0

    st.success("Simulation Complete 🌍")
    st.metric("Estimated Energy (Megatons TNT)", f"{tnt_megatons:,.2f}")
    st.metric("Crater Diameter (km)", f"{crater_km:,.2f}")
    st.metric("Blast Radius (km)", f"{blast_km:,.2f}")
    st.metric("Equivalent Earthquake Magnitude (Mw)", f"{Mw:.2f}")

    st.caption("Approximation based on simplified impact scaling (Collins et al., 2005)")

# --------------------------
# Footer
# --------------------------
st.markdown("---")
st.markdown("""
### 📡 Data Source
**NASA Near-Earth Object (NEO) API**
- Size, velocity, and estimated diameter  
- Hazard classification  
- Close-approach distance and relative velocity  

🔗 [NASA NEO API Documentation](https://api.nasa.gov/)

### 🧑‍🚀 Future Improvements
🌠 Add asteroid deflection/mitigation simulations  
🧭 Integrate USGS topography & seismic data  
🎓 Include educational pop-ups explaining impact science  
🎮 Add gamified “Defend Earth” mode  

### 📜 License
Open source under the MIT License.  
NASA data © Public Domain under NASA Open Data Policy.
""")
