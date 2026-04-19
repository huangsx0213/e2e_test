# QuantumQA Deployment Guide (Hugging Face Spaces)

This document outlines the specific Git workflow used to deploy the QuantumQA project to Hugging Face Spaces.

## Overview: The "Orphan Branch" Strategy

Since Hugging Face Spaces typically use the `main` branch to trigger builds, and we want to ensure the production environment exactly matches our local "clean" state (including all latest fixes and the Dockerfile), we use an **Orphan Push** strategy.

This method creates a temporary branch with no history, commits the current files, and force-pushes them to the remote. This is the most reliable way to handle deployments in a pair-programming/agentic context.

---

## 1. Remote Setup (One-time)

Ensure you have the Hugging Face Space repository added as a remote named `hf`:

```bash
# Replace with your actual Space URL
git remote add hf https://huggingface.co/spaces/Huangsx0213/QuantumQA
```

---

## 2. The Deployment Workflow

Follow these steps exactly to push a new version:

### Step A: Save local changes to main
```bash
git add .
git commit -m "feat/fix: descriptive message of your changes"
```

### Step B: Create a clean deployment branch
We use `--orphan` to start a branch with a completely empty history.
```bash
git checkout --orphan hf-deploy-tmp
```

### Step C: Commit all files
Even though the branch is "new", the files are still in your working directory.
```bash
git add .
git commit -m "Production Build: $(date)"
```

### Step D: Force push to Hugging Face
This forces the Space's `main` branch to ignore its old history and perfectly track your current local files.
```bash
git push hf hf-deploy-tmp:main --force
```

### Step E: Cleanup
Return to your working branch and delete the temporary deployment branch.
```bash
git checkout main
git branch -D hf-deploy-tmp
```

---

## 3. Why This Method?

| Feature | why we use it |
| :--- | :--- |
| **Clean Slate** | Guarantees no "merge conflicts" on the cloud side. |
| **Deterministic** | Ensures the `Dockerfile` and `dist/` folders are exactly as you see them locally. |
| **Safety** | Your main development history is preserved while the production branch stays "flat" and efficient. |

## 4. Monitoring the Build

After the push, you can monitor the status:
1.  Open your [Hugging Face Space](https://huggingface.co/spaces/Huangsx0213/QuantumQA).
2.  Click the **"Logs"** tab to see the Docker build and Node.js startup progress.
3.  If you see `node dist/server.cjs` running, the deployment was successful!
