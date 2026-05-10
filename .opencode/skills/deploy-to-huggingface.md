# Skill: Deploy to Hugging Face Spaces

## Purpose
This skill automates the full deployment process of the QuantumQA project to Hugging Face Spaces using the "Orphan Branch" strategy.

## Prerequisites
- The `hf` git remote must be configured:
  ```
  git remote add hf https://huggingface.co/spaces/Huangsx0213/QuantumQA
  ```
- You must be on the `main` branch with a clean working state.

## Execution Steps

### Step 1: Verify Environment
Confirm you are on the `main` branch and check for any uncommitted changes:
```bash
git status
git branch --show-current
```
If there are uncommitted changes, commit them first with a descriptive message before proceeding.

### Step 2: Commit Any Pending Changes
If `git status` shows changes, stage and commit them:
```bash
git add .
git commit -m "pre-deploy: save latest changes"
```

### Step 3: Verify the Build Locally
Run the full production build and database setup to catch any errors before publishing:
```bash
npm run build && npm run migrate && npm run seed
```
This generates:
- `dist/index.html` + `dist/assets/` — the frontend
- `dist/agent.bundle.js` — the pre-bundled Agent (required for download feature)
- `dist/server.cjs` — the backend server
- Initialized database with seed data

If the build **fails**, **do not proceed**. Fix the error and retry from Step 1.

### Step 4: Create the Deployment Orphan Branch
Create a clean branch with no history to ensure a pristine deployment:
```bash
git checkout --orphan hf-deploy-tmp
```

### Step 5: Commit All Files to the Deployment Branch
```bash
git add .
git commit -m "Production Build: $(date)"
```

Include the database file (`server/db.sqlite`) in the deployment to ensure data persistence across restarts.

### Step 6: Force Push to Hugging Face
```bash
git push hf hf-deploy-tmp:main --force
```
Wait for the push to complete and confirm the output shows a successful update to `main`.

### Step 7: Cleanup
Return to the `main` branch and delete the temporary deployment branch:
```bash
git checkout main
git branch -D hf-deploy-tmp
```

### Step 8: Verify Deployment
- Open: https://huggingface.co/spaces/Huangsx0213/QuantumQA
- Check the **"Logs"** tab for Docker build progress.
- When you see `node dist/server.cjs` in the logs, the deployment is live.

## Success Criteria
- The Hugging Face Space status shows **"Running"** (green).
- The app loads correctly at the Space URL.
- The "Download Agent" button returns a valid `.zip` file.
- The agent connects successfully via `wss://`.

## Troubleshooting

| Symptom | Likely Cause | Fix |
| :--- | :--- | :--- |
| Build fails with `esbuild` error | Missing `--external` flag for a native module | Add module to `--external` list in `package.json` build:agent script |
| Docker build exits with code 1 | Dockerfile or dependency error | Check Space Logs tab for the exact error |
| Agent download returns 500 error | `dist/agent.bundle.js` missing | Ensure `npm run build` succeeded and the file exists |
| Agent can't connect (`ws://` vs `wss://`) | `trust proxy` not enabled | Verify `app.set('trust proxy', true)` is in `server/app/createApp.ts` |
| Report not generated after remote run | Early `return` in runner | Verify `server/modules/execution/runner.ts` has no early return in the remote branch |
