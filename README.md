# ImpactScope: Meteor Madness
A 3D planetary defense observatory and Near-Earth Object collision simulator built for the NASA Space Apps Challenge.

[Live Demo](https://2025-nasa-space-apps-challenge-meteor-madness.vercel.app) | [NASA Space Apps Challenge](https://www.spaceappschallenge.org/)

---

## Overview

ImpactScope is an interactive 3D web observatory that visualizes Near-Earth Objects (NEOs), calculates realistic asteroid impact physics, and models planetary defense deflection missions.

The application ingests live telemetry from NASA's NeoWs API, renders real-time 3D planetary and orbital visualizations using Three.js, and runs client- and server-side physics models to calculate kinetic yield, atmospheric airburst fragmentation, crater scaling, seismic shock, and orbital trajectory changes.

---

## Key Features

### Live NASA Telemetry Integration
- Ingests real-time orbital and physical parameters from the NASA NeoWs (Near Earth Object Web Service) REST API.
- Caches live feed data with fallback to curated NASA JPL ephemerides for critical scenarios.
- Tracks estimated diameters, velocities, approach dates, and miss distances for active asteroids including Apophis, Bennu, Didymos, and 2024 YR4.

### 3D Visualization and Rendering Engine
- Built with Three.js and WebGL for real-time 60 FPS orbital rendering.
- Features day/night planetary illumination, atmospheric scattering shaders, topological bump mapping, and procedural starry backgrounds.
- Procedural 3D asteroid geometry generation with dynamic crater deformation, surface roughness, and composition-based texturing.
- Multiple camera projection modes: Orbital Observer, Atmospheric Entry, Ground Zero, and Split-Screen Mission Control.

### Impact Physics and Consequence Modeling
- **Kinetic Energy Conversion**: Calculates total impact energy ($E = 0.5 \cdot m \cdot v^2$) and converts to TNT equivalent yield (kilotons and megatons).
- **Atmospheric Entry and Airburst**: Solves stagnation ram pressure $P_{\text{ram}}(z) = \rho(z) \cdot v^2$ against target tensile yield strength to determine whether an object detonates at high altitude (airburst) or creates a ground crater.
- **Crater Dimensions**: Estimates transient and final crater diameter using empirical scaling laws based on projectile density, impact velocity, impact angle, and target terrain density.
- **Environmental Effects**: Computes blast wave radii, overpressure zones, thermal radiation distance, and equivalent earthquake magnitude ($M_w$) using Gutenberg-Richter relations.
- **Terrain Detection**: Detects land vs. ocean coordinates to calculate deep-water displacement and tsunami potential.

### Planetary Defense Simulation (DART)
- Models momentum transfer and orbital deflection based on NASA's Double Asteroid Redirection Test (DART) mission data.
- Simulates three deflection methodologies: Kinetic Impactor, Gravity Tractor, and Standoff Nuclear Detonation.
- Calculates delta-v requirements ($\Delta v$), momentum enhancement ($\beta$-factor), and deflection miss distance at Earth intercept across user-defined warning timelines (1 to 20 years).

### Procedural Audio Engine
- Built-in Web Audio API sound generator that synthesizes atmospheric entry plasma, sonic booms, seismic rumbles, and telemetry sounds directly in the browser without external audio assets.

---

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS, Motion, Lucide Icons
- **3D Graphics**: Three.js, WebGL
- **Backend / API**: Express, Node.js, Vercel Serverless Functions
- **Data Source**: NASA Open Data API (NeoWs / JPL Small-Body Database)
- **Audio**: Web Audio API (Synthesized procedural audio)

---

## Architecture

```
ImpactScope
├── api/
│   └── index.ts                 # Serverless API routes (NEO fetcher, impact and deflection physics)
├── public/
│   ├── assets/                  # UI assets and reference materials
│   └── textures/                # Planetary textures (Earth, Moon, normal maps, topologies)
├── src/
│   ├── components/
│   │   ├── EarthViewport.tsx    # Three.js 3D viewport, orbital camera, shader materials
│   │   └── ProfessorAcademyDrawer.tsx # Educational telemetry and physics breakdown
│   ├── utils/
│   │   ├── asteroid3DGenerator.ts # Procedural asteroid geometry and crater displacement
│   │   ├── impactPhysics.ts     # Impact scaling, airburst, and deflection math
│   │   └── soundEngine.ts       # Web Audio API procedural sound synthesizer
│   ├── App.tsx                  # Root application state, telemetry HUD, docked controls
│   ├── main.tsx                 # React entrypoint
│   └── types.ts                 # TypeScript interfaces for NEOs, physics, and telemetry
├── server.ts                    # Local development server with Vite middleware
├── vercel.json                  # Production routing configuration
└── vite.config.ts               # Vite build and plugin configuration
```

---

## Getting Started

### Prerequisites
- Node.js (v18 or higher)
- npm

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/awaisstack/2025-NASA-Space-Apps-Challenge-Meteor-Madness.git
   cd 2025-NASA-Space-Apps-Challenge-Meteor-Madness
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. (Optional) Configure environment variables:
   Create a `.env` file in the root directory if you want to use a custom NASA API key:
   ```env
   NASA_API_KEY=your_key_here
   ```
   If omitted, the application uses built-in demo credentials and curated NASA JPL ephemerides.

4. Start the development server:
   ```bash
   npm run dev
   ```
   Open `http://localhost:3000` in your browser.

5. Build for production:
   ```bash
   npm run build
   ```

---

## Scientific References

The calculation models implemented in this project are adapted from planetary science literature:
- Holsapple, K. A. and Schmidt, R. M. - Point-source solutions and crater scaling laws.
- Collins, G. S., Melosh, H. J., and Marcus, R. A. - Earth Impact Effects Program (Meteoritics and Planetary Science).
- NASA DART Investigation Team - Momentum transfer from kinetic impactor (Nature, 2023).

---

## License

This project was built for the NASA Space Apps Challenge.
Licensed under the [MIT License](LICENSE).
