---
title: QuantumQA
emoji: 🧪
colorFrom: purple
colorTo: indigo
sdk: docker
app_port: 7860
---

# QuantumQA

QuantumQA is a unified, low-code **E2E Testing Matrix** designed for high-fidelity UI automation and sophisticated API testing. It bridges the gap between browser interactions and background service validation in a single, deterministic execution engine.

---

## 🌟 Key Features

- **Unified Logic**: Seamlessly mix Playwright-driven UI steps and fetch-driven API steps in a single test case.
- **Deterministic Engine**: Built on a robust Node.js backend to ensure zero "hallucinations" and maximum execution stability.
- **Intelligent Recording**: 
    - **UI Recorder**: Uses Playwright's official selector engine (same as `codegen`) to generate resilient selectors; CSS fallback for edge cases.
    - **API Recorder**: Traffic sniffer automatically maps network requests to environment-aware endpoints.
- **Layered Variable System**: Advanced scoping (Case, Suite, Scenario, Environment) with dynamic generators and transformation pipes.
- **Resilient POM**: A centralized Element Repository that decouples test steps from brittle UI selectors.
- **Real-time Feedback**: Execution logs are streamed directly to the console via Server-Sent Events (SSE).

---

## 🛠 Technology Stack

- **Frontend**: React 19, Vite, Lucide, TailwindCSS.
- **Backend**: Express 5, Better-SQLite3, tsx.
- **Automation**: Playwright (with support for Chromium).
- **Persistence**: Local SQLite database for rapid, lightweight asset management.

---

## 🚀 Quick Start

### Prerequisites
- Node.js 20.19 or newer
- npm or yarn

### Installation
1. Clone the repository.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Install Playwright browser binaries:
   ```bash
   npx playwright install chromium
   ```

### Running Locally
Start the unified development server (Vite + Express):
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📑 Documentation Index

For detailed guides, please refer to our documentation suite:

1.  **[User Guide](docs/01-UserGuide.md)**: A complete manual on how to write tests, use variables, and manage assets.
2.  **[Architecture](docs/02-Architecture.md)**: Technical overview of the system design, communication protocols, and execution lifecycle.
3.  **[Deployment Guide](docs/03-Deployment.md)**: Instructions for production builds, Dockerization, and cloud hosting (Hugging Face Spaces).
4.  **[Technical Implementation](docs/04-TechnicalImplementation.md)**: Implementation details for the recording engine, variable scoping, and execution runners.

---

## 🔨 Standard Commands

- `npm run dev`: Full-stack development environment.
- `npm run seed`: Reset and seed the database to the default state.
- `npm run export:seed`: Export current database as a seed snapshot to `server/seed-data/business-config.ts`. Run this after making changes to the database that you want to preserve as the new default state.
- `npm run migrate`: Run database migrations standalone.
- `npm run build`: Production build (bundles frontend with Vite and backend with esbuild).
- `npm run start`: Start the production server.
- `FORCE_SEED=true npm run dev`: Start dev mode and clean-reset the database simultaneously.

---

## 🐳 Deployment Summary

QuantumQA is fully Docker-compatible. For cloud deployments:
- Mount a persistent volume for `database.sqlite` to ensure data persistence.
- Set `PORT` environment variable (defaults to 3000, 7860 for HF Spaces).
- Refer to the [Deployment Guide](docs/03-Deployment.md) for multi-stage Dockerfile configurations.
