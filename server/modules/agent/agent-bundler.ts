import AdmZip from 'adm-zip';
import fs from 'fs';
import path from 'path';
import os from 'os';

const ROOT_DIR = process.cwd();

export async function createAgentPackage(serverUrl: string): Promise<Buffer> {
    const tempDir = path.join(os.tmpdir(), `agent-pkg-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });

    try {
        // 1. Use the pre-bundled Agent Code (built at build-time)
        const bundleSrc = path.join(ROOT_DIR, 'dist', 'agent.bundle.js');
        const bundleDest = path.join(tempDir, 'agent.js');
        
        if (!fs.existsSync(bundleSrc)) {
            throw new Error(`Agent bundle not found at ${bundleSrc}. Please ensure build step was successful.`);
        }
        
        fs.copyFileSync(bundleSrc, bundleDest);

        // 2. Create Config
        const config = {
            serverUrl: serverUrl,
            agentName: `remote-agent-${Math.random().toString(36).substring(7)}`,
        };
        fs.writeFileSync(path.join(tempDir, 'agent-config.json'), JSON.stringify(config, null, 2));

        // 3. Create package.json
        const pkgJson = {
            name: "quantum-qa-agent",
            version: "1.0.0",
            private: true,
            type: "module",
            dependencies: {
                "playwright": "^1.49.0"
            }
        };
        fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(pkgJson, null, 2));

        // 4. Create Start Scripts
        const startBat = `@echo off
setlocal
echo ========================================
echo   Quantum QA Remote Agent Startup
echo ========================================

where node >nul 2>nul
if %errorlevel% neq 0 goto :no_node

if exist node_modules goto :start_agent

echo [INFO] Installing dependencies
call npm install
if %errorlevel% neq 0 goto :npm_fail

:start_agent
echo [INFO] Ensuring browsers are ready
call npx playwright install chromium

echo [INFO] Starting agent
node agent.js
pause
goto :eof

:no_node
echo [ERROR] Node.js not found. Please install Node.js v20.
pause
exit /b 1

:npm_fail
echo [ERROR] npm install failed.
pause
exit /b 1
`;
        fs.writeFileSync(path.join(tempDir, 'start-agent.bat'), startBat);

        const startSh = `#!/bin/bash
echo "========================================"
echo "  Quantum QA Remote Agent Startup"
echo "========================================"
echo

if ! command -v node &> /dev/null
then
    echo "[ERROR] Node.js is not installed! Please install Node.js v20 or higher."
    exit 1
fi

if [ ! -d "node_modules" ]; then
    echo "[INFO] Installing dependencies"
    npm install
fi

echo "[INFO] Ensuring browsers are ready"
npx playwright install chromium

echo "[INFO] Starting agent"
node agent.js
`;
        fs.writeFileSync(path.join(tempDir, 'start-agent.sh'), startSh);
        fs.chmodSync(path.join(tempDir, 'start-agent.sh'), '755');

        // 5. Zip it up
        const zip = new AdmZip();
        zip.addLocalFile(bundleDest);
        zip.addLocalFile(path.join(tempDir, 'agent-config.json'));
        zip.addLocalFile(path.join(tempDir, 'package.json'));
        zip.addLocalFile(path.join(tempDir, 'start-agent.bat'));
        zip.addLocalFile(path.join(tempDir, 'start-agent.sh'));

        return zip.toBuffer();

    } finally {
        // Cleanup temp folder
        try {
            fs.rmSync(tempDir, { recursive: true, force: true });
        } catch (e) {
            console.error('Failed to cleanup temp dir:', e);
        }
    }
}
