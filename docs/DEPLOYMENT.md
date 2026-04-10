# Hugging Face Spaces 部署指南 (完整版)

本指南详细介绍了如何将 **Quantum QA Matrix** 手动部署到 Hugging Face Spaces。本项目采用 **Docker SDK**，以支持复杂的后端逻辑和 Playwright 浏览器自动化。

---

## 1. 环境准备

### 1.1 Hugging Face 账号
在 [Hugging Face](https://huggingface.co/) 注册并创建一个新的 Space。
- **SDK**: 选择 **Docker**。
- **Template**: 选择 **Blank**。
- **Visibility**: 建议先选择 **Private**（安全性更高），部署成功后再调整。

### 1.2 Access Token
由于需要通过 Git 手动推送，您需要一个具有 **Write** 权限的访问令牌：
1. 前往 **Settings -> Access Tokens**。
2. 创建一个名为 `HF_DEPLOY_TOKEN` 的新令牌，类型为 **Write**。

---

## 2. 核心配置文件

为了使部署成功，项目中必须包含以下三个关键文件：

### 2.1 README.md (元数据)
Space 的配置核心是 `README.md` 顶部的 YAML 区块：
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
> **注意**: `app_port` 必须设置为 `7860`。

### 2.2 Dockerfile
使用多阶段构建，并确保 Playwright 版本与 `package.json` 一致。
- **基础镜像**: 使用 `mcr.microsoft.com/playwright:v1.58.2-noble` (需与 package.json 同步)。
- **构建阶段**: 使用 Node.js 构建前端和后端。
- **运行阶段**: 拷贝构建产物，并设置 `PORT=7860`。

### 2.3 .dockerignore
确保 `node_modules` 和 `*.sqlite` 等本地文件不被上传。

---

## 3. Hugging Face 平台配置

在 Space 的 **Settings -> Variables and secrets** 中配置：

### 3.1 Secrets (加密变量)
- `GEMINI_API_KEY`: 您的 Google AI Studio API 密钥（用于 AI 录制功能）。

### 3.2 Variables (环境变量)
- `FORCE_SEED`: (可选) 设置为 `true` 可强制在启动时重置并填充种子数据。

---

## 4. 手动部署流程 (Git)

如果由于历史记录过大导致推送失败，推荐使用“孤岛推送法（Orphan Push）”：

### 第 1 步：配置远程仓库
```bash
# 替换您的用户名和 Space 名称
git remote add hf https://您的用户名:您的Token@huggingface.co/spaces/您的用户名/您的Space名称
```

### 第 2 步：创建纯净的分支
为了避免历史记录中的大文件干扰推送，建议只推送当前状态：
```bash
# 创建一个没有任何历史记录的新分支
git checkout --orphan hf-deployment

# 添加所有当前文件
git add .

# 提交
git commit -m "Initial clean deployment"
```

### 第 3 步：推送到云端
```bash
# 推送本地分支到远程的 main 分支，并强制覆盖
git -c credential.helper= push hf hf-deployment:main --force
```

---

## 5. 运维与验证

### 5.1 查看日志
- 在 Space 页面点击 **Logs** 标签，查看容器构建和启动情况。
- 成功标志：看到 `Server running on http://localhost:7860`。

### 5.2 数据重置
本项目默认不使用持久化云盘。如果您需要重置数据：
1. 在 Settings 中将 `FORCE_SEED` 改为 `true`。
2. 重启 Space。

### 5.3 故障排除
- **Cannot find module 'vite'**: 确保 `startServer.ts` 中使用了**动态导入**，因为生产环境不安装 `devDependencies`。
- **Browser executable doesn't exist**: 确保 `Dockerfile` 中的基础镜像版本（如 `v1.58.2`）与 `package.json` 中的 `playwright` 版本完全对应。

---
