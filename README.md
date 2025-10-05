# 🌍 Meteor Madness — 2025 NASA Space Apps Challenge

**Challenge Theme:** Meteor Madness  
**Event:** 2025 NASA International Space Apps Challenge  

---

## 🚀 Overview

**Meteor Madness** is an interactive asteroid impact visualization and simulation tool built for the **2025 NASA Space Apps Challenge**.  
It uses **real NASA Near-Earth Object (NEO) data** to model asteroid impacts, visualize crater effects, and estimate the destructive potential of hypothetical impactors like **“Impactor-2025.”**

This project bridges **science and accessibility** — allowing both the public and decision-makers to explore asteroid impact consequences through a web-based, physics-based simulation.

---

## 🛰️ Features

- 🔭 **Live NASA NEO Data:** Fetches real asteroid parameters (size, velocity, hazard status) from NASA’s [NeoWs API](https://api.nasa.gov/).
- 💥 **Impact Physics Simulation:** Calculates energy, crater size, blast radius, and equivalent earthquake magnitude based on user inputs.
- 🌎 **3D Earth Visualization:** Interactive globe (using Three.js + ThreeGlobe) to display simulated impact zones dynamically.
- 🧮 **Scientific Accuracy:** Uses simplified physical formulas with adjustable parameters (density, velocity, etc.) to estimate impact outcomes.
- 🧠 **Educational Purpose:** Helps users visualize the potential effects of asteroid impacts and understand the science behind planetary defense.

---

## 🧩 Tech Stack

| Layer | Technology |
|-------|-------------|
| **Backend** | Python (Flask) |
| **Frontend** | HTML, CSS, JavaScript |
| **3D Visualization** | Three.js + ThreeGlobe |
| **Data Source** | NASA Near-Earth Object Web Service (NeoWs API) |

---

## ⚙️ How It Works

1. The backend (`app.py`) connects to the **NASA NEO API** and normalizes asteroid data (name, size, velocity, hazard level).  
2. When the user inputs an asteroid’s **diameter** and **velocity**, the backend estimates:
   - Kinetic energy (in Joules)
   - TNT equivalent (kilotons / megatons)
   - Crater diameter (km)
   - Blast radius (km)
   - Earthquake magnitude (Mw)
3. The frontend then visualizes this on a **3D rotating globe** with expanding impact zones for realistic demonstration.

---

## 🧮 Example Simulation

**Scenario:** A 20 km asteroid traveling at 11 km/s  
**Results:**
- Energy ≈ 1e24 Joules  
- Equivalent to several **million megatons of TNT**  
- **Crater:** ~200–250 km wide  
- **Global blast effects** and seismic events (≈ magnitude 10+ equivalent)  

*(Approximate educational estimate; not a scientific prediction.)*

---

## 🧰 Installation & Setup

### Prerequisites
- Python 3.9+
- pip (Python package manager)

### Steps
```bash
# 1️⃣ Clone this repository
git clone https://github.com/awaisstack/2025-NASA-Space-Apps-Challenge-Meteor-Madness.git
cd 2025-NASA-Space-Apps-Challenge-Meteor-Madness

# 2️⃣ Create and activate a virtual environment
python -m venv venv
source venv/bin/activate    # On macOS/Linux
venv\Scripts\activate       # On Windows

# 3️⃣ Install dependencies
pip install flask requests

# 4️⃣ (Optional) Create a .env file with your NASA API key
echo NASA_API_KEY=YOUR_API_KEY > .env

# 5️⃣ Run the application
python app.py
```
Then open your browser and visit:
👉 http://localhost:5000
---
📡 Data Source
NASA Near-Earth Object (NEO) API
Provides orbital and physical data for asteroids and comets, including:

-Size, velocity, and estimated diameter
-Hazard classification
-Close-approach distance and relative velocity

🔗 NASA NEO API Documentation: https://api.nasa.gov/
---
🧑‍🚀 Future Improvements
🌠 Add asteroid deflection/mitigation simulations
🧭 Integrate USGS topography & seismic data
🎓 Include educational pop-ups explaining impact science
🎮 Add gamified “Defend Earth” mode
---
📜 License
This project is open source and free to use under the MIT License.
All NASA data is publicly accessible under NASA’s Open Data Policy.
---
🪐 Acknowledgments

Special thanks to:
NASA — for the NEO datasets and open API access
USGS — for geological and seismic datasets (future integration)
Space Apps Global Community — for inspiration, mentorship, and collaboration
---
