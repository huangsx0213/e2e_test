# Quantum QA Matrix

**Quantum QA Matrix** is a full-stack automated testing asset and execution management platform. It aims to provide a unified, centralized workbench for QA teams to manage UI automation, API automation test assets, test scenarios, test suites, and execution reports.

## ✨ Features

- 🏢 **Multi-Project & Multi-Environment Management**: Supports global project switching and the configuration/seamless switching of multiple test environments (e.g., DEV, SIT, UAT, PROD).
- 🖥️ **UI Test Asset Management**: 
  - **Pages**: Manage the pages of the system under test.
  - **Elements**: Centrally maintain UI element locators (XPath, CSS Selectors, etc.) on pages.
  - **Modules**: Encapsulate reusable UI operation logic modules.
- 🔌 **API Test Asset Management**:
  - **Headers**: Centrally manage API request header configurations.
  - **Endpoints**: Maintain API endpoint URLs, Methods, etc.
  - **Payloads**: Manage API request parameters and payloads.
  - **Assertions**: Define expected results and validation rules for API responses.
- 🎬 **Test Scenarios & Suites**: Orchestrate discrete UI and API assets into complete business test scenarios, and assemble them into executable test suites.
- 📊 **Test Reports**: Record detailed results of test executions, pass rates, duration, and error logs.
- ⚙️ **System Settings**: Flexible global configurations with persistent state saving.

## 🛠️ Tech Stack

**Frontend**
- **React 18**: Core library for building user interfaces.
- **Vite**: Next-generation frontend tooling.
- **Tailwind CSS**: A utility-first CSS framework for rapid UI development.
- **Lucide React**: Beautiful & consistent open-source icon library.

**Backend**
- **Node.js & Express**: Fast, unopinionated, minimalist web framework.
- **TypeScript**: Provides end-to-end type safety.
- **Zod**: TypeScript-first schema declaration and validation library.

**Database**
- **SQLite (better-sqlite3)**: Lightweight, high-performance local relational database. Uses `journal_mode = DELETE` to ensure data persistence in containerized environments.

## 📂 Project Structure

```text
.
├── client/                 # Frontend React source code
│   ├── components/         # Reusable UI components (e.g., Settings, Layout)
│   ├── hooks/              # Custom React Hooks (e.g., useCrud)
│   ├── services/           # API request encapsulation (api.ts)
│   ├── App.tsx             # Frontend main entry and routing configuration
│   └── main.tsx            # React mount point
├── server/                 # Backend Express source code
│   ├── migrations/         # Database table creation and migration scripts
│   ├── modules/            # Backend logic divided by business modules (Controllers, Services, Repositories, Validators)
│   ├── shared/             # Shared type definitions and generic CRUD logic between frontend and backend
│   ├── app.ts              # Express instance configuration and route registration
│   ├── database.ts         # SQLite database connection and configuration
│   ├── index.ts            # Backend service startup entry (integrates Vite middleware)
│   └── seed.ts             # Database initialization and Mock data injection script
├── dist/                   # Production build artifacts
├── package.json            # Project dependencies and script configurations
└── vite.config.ts          # Vite build configuration
```

## 🚀 Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Initialize Database & Mock Data

Migration scripts will run automatically when the project starts. If you need to reset the database and inject the initial Mock data (which includes two sample projects: "Web Shop QA" and "Admin Console QA"), you can run:

```bash
npx tsx server/seed.ts
```

### 3. Local Development

Start the full-stack development server (Frontend Vite HMR + Backend Express API):

```bash
npm run dev
```
The server will run at `http://localhost:3000` by default.

### 4. Production Build & Run

Build frontend static assets and compile backend code:

```bash
npm run build
```

Start the production server:

```bash
npm start
```

## 💡 Architecture Overview

- **Generic CRUD Abstraction**: The backend abstracts standard Create, Read, Update, and Delete logic via `server/shared/crud.ts`, significantly reducing boilerplate code. The frontend implements seamless integration and optimistic updates with the backend via the `useCrud` hook.
- **Data Validation**: All API requests undergo strict data structure and type validation via Zod schemas before entering the Service layer, ensuring system robustness.
- **Single-File Database**: Adopts SQLite as the data storage solution, requiring no additional database service deployment. It works out-of-the-box, making it highly suitable for the asset management needs of small to medium-sized QA teams.

## 📝 License

MIT License
