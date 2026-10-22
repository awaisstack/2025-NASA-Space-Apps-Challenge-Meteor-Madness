# ImpactScope: Meteor Madness
### Cinematic 3D Planetary Defense Observatory and NASA Impact Physics Simulator

<div align="center">

[![NASA Space Apps Challenge 2025](https://img.shields.io/badge/NASA%20Space%20Apps-2025%20Challenge-blue?style=for-the-badge&logo=nasa)](https://www.spaceappschallenge.org/)
[![React 19](https://img.shields.io/badge/React-19.0-61DAFB?style=for-the-badge&logo=react)](https://react.dev/)
[![Three.js](https://img.shields.io/badge/Three.js-3D%20Engine-black?style=for-the-badge&logo=threedotjs)](https://threejs.org/)
[![Vite](https://img.shields.io/badge/Vite-8.3-646CFF?style=for-the-badge&logo=vite)](https://vitejs.dev/)
[![Vercel Ready](https://img.shields.io/badge/Vercel-Serverless%20Ready-000000?style=for-the-badge&logo=vercel)](https://vercel.com/)

<p align="center">
  <strong>An interactive space observatory where you can track live asteroids approaching Earth, simulate what happens if one strikes, and launch planetary defense missions to deflect them before it is too late.</strong>
</p>

[Explore Live Demo](#one-click-deployment-to-vercel) | [How It Works](#what-is-impactscope-in-plain-english) | [Key Features](#features-at-a-glance) | [Quickstart](#run-locally)

---

</div>

## What is ImpactScope? (In Plain English)

Every single day, thousands of space rocks (Near-Earth Objects or **NEOs**) zip through our solar neighborhood at speeds exceeding **70,000 km/h**. Most burn up harmlessly as shooting stars. But what would happen if a massive asteroid, the size of a skyscraper or a football stadium, was on a direct collision course with Earth?

**ImpactScope** is an interactive, cinematic science observatory built for the **2025 NASA Space Apps Challenge**. It takes real, complex planetary physics and NASA telescope data and turns them into an intuitive, visually stunning experience that anyone can explore.

You do not need a PhD in astrophysics to use it. Spin the Earth, pick an asteroid passing by this week, choose an impact target, and watch genuine science unfold in real-time 3D.

---

## Features At A Glance

### 1. Real NASA Radar and Telescope Feeds
ImpactScope connects directly to **NASA's NeoWs (Near Earth Object Web Service)** API:
- Browse live, real-time asteroids currently tracked by NASA telescopes across the world.
- Inspect real data: estimated diameter, approach velocity, miss distance, and hazard classifications.
- Instant access to famous benchmark asteroids:
  - **99942 Apophis** (the infamous 370-meter asteroid flying close in 2029)
  - **101955 Bennu** (the rubble-pile asteroid sampled by NASA's OSIRIS-REx)
  - **Dimorphos and Didymos** (the targets of NASA's historic DART deflection mission)
  - **Chicxulub** (the 10-kilometer asteroid that wiped out the dinosaurs 66 million years ago)

### 2. Interactive 3D Earth Observatory
- **Full 3D Globe**: Rendered in Three.js with realistic topological elevation, atmospheric cloud layers, day/night shading, and starry deep-space backgrounds.
- **Click-to-Target**: Click anywhere on the globe (oceans, deserts, mountains, or cities) to set the simulation coordinates.
- **Dynamic Camera Modes**: Switch between Orbital View, Atmospheric Entry Cam, Ground Zero Cam, or Split-Screen Mission Control.

### 3. True Impact Physics and Consequence Engine
Curious about the damage? ImpactScope calculates the physics under the hood:
- **Kinetic Energy and Megatons**: Converts collision energy into TNT equivalents (for example, "Equivalent to 1,200 Megatons or 80,000 Hiroshima atomic bombs").
- **Crater Sizing**: Computes whether the asteroid punches a multi-kilometer crater or detonates as a high-altitude atmospheric **airburst** (like the 2013 Chelyabinsk meteor).
- **Blast Waves and Thermal Radiation**: Shows the radius of destruction, hurricane-force wind zones, and thermal flash radius.
- **Seismic Shock**: Computes the equivalent Richter/Moment Magnitude earthquake ($M_w$) triggered by the collision.
- **Tsunami Warning**: If you strike an ocean coordinate, it simulates deep-water displacement waves.

### 4. Planetary Defense Simulator (DART Mission Control)
**Do not just watch Earth get hit: save it!**
- Jump into the Planetary Defense module inspired by NASA's **DART (Double Asteroid Redirection Test)**.
- Choose your deflection strategy:
  - **Kinetic Impactor**: Slam a high-velocity probe into the asteroid to nudge its orbital velocity ($\Delta v$).
  - **Gravity Tractor**: Park a massive spacecraft beside the asteroid to pull it gravitationally over time.
  - **Standoff Nuclear Detonation**: Vaporize surface material to act as a rocket push.
- Adjust warning time (from 1 year to 20 years) and see if your deflection arc clears Earth's gravitational collision zone!

### 5. Professor's Planetary Defense Academy
A built-in interactive flight academy designed for students and space enthusiasts:
- Explains the **Torino and Palermo Impact Hazard Scales**.
- Breaks down asteroid compositions: **Stony (Silicate)**, **Metallic Iron-Nickel**, **Loose Rubble-Pile**, and **Porous Cometary Ice**.
- Walkthroughs of famous historical impact events throughout Earth's history.

### 6. Dynamic Browser Audio Synthesis
Built-in Web Audio synthesizer generating realistic soundscapes without external audio files:
- Atmospheric entry plasma roars
- Hypersonic sonic booms
- Deep seismic low-frequency rumblings
- Emergency alert sirens and telemetry clicks

---

## Technology Architecture

```
ImpactScope Architecture
│
├── Frontend (React 19 + Vite 8 + Three.js)
│   ├── src/components/EarthViewport.tsx       <- High-performance 3D Earth, Asteroid meshes, Particle shaders
│   ├── src/components/ProfessorAcademyDrawer.tsx <- Educational physics breakdown and telemetry
│   ├── src/utils/asteroid3DGenerator.ts      <- Procedural 3D asteroid geometry and crater deformations
│   ├── src/utils/impactPhysics.ts            <- Empirical crater scaling, Collins and Melosh airburst equations
│   └── src/utils/soundEngine.ts              <- Web Audio API real-time sound synthesizer
│
├── Serverless API (Vercel / Express)
│   ├── api/index.ts                          <- Vercel serverless function entrypoint
│   ├── GET /api/neos                         <- Live NASA NeoWs fetcher with 2-minute caching and JPL fallback
│   ├── GET /api/neo/:id                      <- Detailed single NEO ephemeris lookup
│   ├── POST /api/impact                      <- Impact consequence physics engine
│   └── POST /api/deflect                     <- Planetary defense orbital deflection calculator
│
└── Deployment Configuration
    ├── vercel.json                           <- Fullstack Vite + Serverless Functions rewrite routing
    └── .vercelignore                         <- Bundle optimization rules
```

---

## Run Locally

### Prerequisites
- **Node.js** (v18 or higher recommended)
- **npm** (comes with Node.js)

### Step 1: Clone the Repository
```bash
git clone https://github.com/awaisstack/2025-NASA-Space-Apps-Challenge-Meteor-Madness.git
cd 2025-NASA-Space-Apps-Challenge-Meteor-Madness
```

### Step 2: Install Dependencies
```bash
npm install
```

### Step 3: (Optional) Set up your NASA API Key
ImpactScope works out of the box with built-in NASA telemetry. If you have your own personal API key from [api.nasa.gov](https://api.nasa.gov), create a `.env` file in the root directory:
```env
NASA_API_KEY=your_nasa_api_key_here
```

### Step 4: Start the Development Server
```bash
npm run dev
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser to start exploring!

---

## One-Click Deployment to Vercel

ImpactScope is fully configured for deployment on **[Vercel](https://vercel.com)**:

### Option A: Using the Vercel Dashboard (Recommended)
1. Fork or push this repository to your GitHub account.
2. Go to **[vercel.com/new](https://vercel.com/new)**.
3. Import the repository `2025-NASA-Space-Apps-Challenge-Meteor-Madness`.
4. Vercel will automatically detect **Vite**:
   - **Framework Preset**: `Vite`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
5. *(Optional)* Add your `NASA_API_KEY` under **Environment Variables**.
6. Click **Deploy**!

### Option B: Using the Vercel CLI
```bash
# Install Vercel CLI
npm install -g vercel

# Deploy Preview
vercel

# Deploy Production
vercel --prod
```

---

## Scientific References and Formulae

ImpactScope's calculations are adapted from peer-reviewed planetary science methodologies:
- **Kinetic Energy Formulation**: $E_k = \frac{1}{2} m v^2$
- **Crater Sizing Models**: Adapted from Holsapple and Schmidt $\pi$-group scaling and Collins, Melosh and Marcus (*Earth Impact Effects Program*).
- **Atmospheric Ram Pressure and Airburst**: Calculates stagnation pressure $P_{\text{ram}}(z) = \rho_{\text{air}}(z) \cdot v^2$ against internal tensile yield strength to determine explosive fragmentation altitude.
- **Seismic Magnitude Correlation**: Gutenberg-Richter equivalent seismic energy formula $M_w = \frac{\log_{10}(E_{\text{seismic}}) - 4.8}{1.5}$.
- **Planetary Defense Deflection**: Momentum enhancement coefficient ($\beta$-factor) scaling from NASA's **DART (Double Asteroid Redirection Test)** mission results published in *Nature* (2023).

---

## License and Disclaimers

- Built for the **NASA Space Apps Challenge 2025** under the *"Meteor Madness"* challenge track.
- **Disclaimer**: ImpactScope is designed for educational, research, and public communication purposes. For official planetary defense notices, consult the **NASA Planetary Defense Coordination Office (PDCO)** and **CNEOS (Center for Near Earth Object Studies)**.
- Released under the [MIT License](LICENSE).
