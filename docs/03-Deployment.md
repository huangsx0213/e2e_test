# QuantumQA Deployment Guide

This project leverages an isomorphic monolithic architecture. Alongside running natively on Local Node environments, it provides deep support for deployments across platforms based on Docker and containerized PaaS (such as Hugging Face Spaces, Render, or self-managed Kubernetes clusters). Because the underlying subsystems rely heavily on headless browser execution and API request orchestration, please ensure that the container specifications are adequately provisioned.

> **AI Recorder — Local server mode**: native (non-Docker) hosts that will run AI recording with `Execution Position = Local server` must have Chromium provisioned (`npx playwright install chromium`). Docker images built from the Playwright base image already include it.

---

## 1. Core Container Configuration Specifications

To ensure the full operational capability of Docker, before deploying or packaging your source code, the following critical files must be present:

### 1.1 `README.md` (Metadata Header)
If you are deploying to cloud hosting platforms like Hugging Face Spaces, the very top of your README file must include a specific YAML Metadata block. This assists the platform in correctly routing ports and parsing behaviors:
```yaml
---
title: QuantumQA
emoji: 🧪
colorFrom: purple
colorTo: indigo
sdk: docker
app_port: 7860
---
```
> **Notice**: Here, `app_port` is forcibly mapped to `7860` to comply with Space regulations.

### 1.2 `Dockerfile`
A Multi-stage build is compulsory to guarantee both a compact production container footprint and execution stability:
- **Phase 1 (Base Construction)**: Select an official core running environment that intrinsically supports headless browser execution (Do not use lightweight Node Alpine variants; instead, use `mcr.microsoft.com/playwright:v<Version>-noble`). It's crucial that this image version tightly coincides with the `playwright` major version referenced within the workspace `package.json`.
- **Phase 2 (Build Environment)**: Leverage Vite for frontend compilation and Esbuild for the Express backend.
- **Phase 3 (Startup Initialization)**: Expose environment parameters and mount points, setting `PORT=7860` to appropriately respond to web traffic.

### 1.3 `.dockerignore`
Filter out localized or extraneous files such as `.git`, `node_modules/`, and the local `database.sqlite`.

---

## 2. Deploying to Hugging Face Spaces (Example Workflow)

Hugging Face Spaces is an excellent free test container platform. For private deployments and debugging, follow these steps:

### 2.1 Preshow（Platform Configuration）
1. Establish a new Space on [Hugging Face](https://huggingface.co/). Choose **Docker** as the SDK type, and it's highly recommended to set the visibility to **Private**.
2. Navigate to **Settings** -> **Variables and secrets** on the repository page, and attach variables as needed:
   * **Variables (Plain Text Environment Variables)**: 
      - `FORCE_SEED`: Setting this to `true` forcefully drops the currently mounted database upon container initialization and reruns `seed.ts`, functioning as a clean-state rollback mechanism.
      - `TRUST_PROXY`: Optional Express proxy trust policy. If omitted, production trusts only `loopback, linklocal, uniquelocal`, while non-production trusts no proxy. Set this to `false`, a numeric hop count, or an Express IP/subnet list for the deployment topology. Explicit `true` is supported only for networks that prevent all direct client access to the application.

### 2.2 Upload Code Assets (Orphan Git Push Method)
If you wish to avoid uploading a massive and complex local commit history to the cloud, execute the "Clean Branch Method" (Orphan Push):

```bash
# 1. Attach Remote Destination
git remote add hf https://YOUR_ACCOUNT:YOUR_WRITE_TOKEN@huggingface.co/spaces/YOUR_USERNAME/YOUR_SPACE_NAME

# 2. Establish a new branch to eliminate historical inertia
git checkout --orphan hf-deployment
git add .
git commit -m "Init Deployment"

# 3. Forcefully Override Push
git -c credential.helper= push hf hf-deployment:main --force
```

---

## 3. Production Precautions and Troubleshooting

### 3.1 Volume Management & Persistence (SQLite Operations)
By default, the core engine designates a local SQLite file (`database.sqlite`) for reading and writing data.
When the application is operating inside a K8S Pod or a non-persistent Docker cloud instance, **should the instance be prematurely recycled due to idling, the subsequent cold boot will completely wipe out all test configuration data.**
Consequently, in a true production setup: please ensure the execution root directory (specifically where `database.sqlite` resides) is physically mounted using a persistent data volume (`Volume / PersistentVolumeClaim`).

### 3.2 UI Action Logs Faults or Missing Browser Executables
- Monitor the Build Logs: If the system outputs an error message like `Browser executable doesn't exist` while initializing the Playwright headless instance, the root cause is that the Playwright structural image inside your Dockerfile lacks necessary Linux system dependency libraries (such as WebKit, Chromium dynamic libraries) or is version-mismatched. Please meticulously verify the `mcr` base image suffix.

### 3.3 Encountering `Cannot find module 'vite'` Error During Boot
- Ascertain that your backend invocation script is executing the pre-bundled `dist/server.cjs` and is not loosely attempting to execute source code via `tsx` within a production environment. Following the execution of `npm run build`, all module reference paths mutate, fundamentally averting crashes caused by missing `devDependencies`.
