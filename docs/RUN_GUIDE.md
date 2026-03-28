# QuantumQA Automation Matrix - 运行与部署说明

本文档介绍了如何在本地环境中运行、调试以及在生产环境中部署 QuantumQA Automation Matrix 平台。

## 1. 环境要求

在开始之前，请确保您的系统已安装以下软件：
* **Node.js**: 建议版本 v20.x 或更高（本项目使用 `target=node20` 进行构建）。
* **包管理器**: `npm` (Node.js 自带) 或 `yarn` / `pnpm`。

## 2. 本地开发运行

本项目采用前后端同构的单体架构（Vite + Express + SQLite），在本地开发时只需启动一个服务即可同时提供 API 和前端热更新。

### 2.1 安装依赖
在项目根目录下运行以下命令安装所有依赖：
```bash
npm install
```

### 2.2 初始化数据库与测试数据（可选）
本项目使用本地 SQLite 数据库（文件名为 `database.sqlite`）。系统在启动时会自动运行数据库迁移（Migrations）创建表结构。
如果您希望填充一些初始的演示数据（如示例项目、测试用例、API 资产等），可以运行种子脚本：
```bash
npx tsx server/seed.ts
```
*注意：运行 seed 脚本会清空现有数据库中的所有数据并重新填充。*

### 2.3 启动开发服务器
运行以下命令启动开发服务器：
```bash
npm run dev
```
启动成功后，控制台会输出类似以下信息：
```
Server running on http://localhost:3000
```
此时，您可以在浏览器中访问 `http://localhost:3000` 来使用系统。
* 前端代码修改后，Vite 中间件会自动进行热更新（HMR）。
* 后端代码修改后，由于使用了 `tsx`，服务会自动重启。

## 3. 生产环境构建与部署

在生产环境中，我们需要将前端代码打包为静态文件，并将后端 TypeScript 代码编译为单文件 JavaScript，以提升运行效率。

### 3.1 构建项目
运行以下命令进行全量构建：
```bash
npm run build
```
该命令会执行两个操作：
1. `vite build`: 将前端 React 代码打包到 `dist/` 目录下。
2. `esbuild`: 将后端 Express 代码打包为 `dist/server.cjs`。

### 3.2 启动生产服务
构建完成后，使用 Node.js 直接运行编译后的产物：
```bash
npm run start
```
或者直接运行：
```bash
node dist/server.cjs
```
生产模式下，Express 服务器会同时提供 API 接口服务，并静态托管 `dist/` 目录下的前端构建产物。

## 4. 常见问题 (FAQ)

**Q: 启动时提示端口被占用 (EADDRINUSE) 怎么办？**
A: 本项目默认使用 `3000` 端口。如果该端口已被其他程序占用，您可以修改 `server/app/startServer.ts` 中的 `PORT` 常量，或者通过环境变量传入新的端口号。

**Q: 如何重置数据库？**
A: 最简单的方法是直接删除项目根目录下的 `database.sqlite` 文件，然后重新运行 `npm run dev`，系统会自动重新创建表结构。如果需要测试数据，再次运行 `npx tsx server/seed.ts` 即可。

**Q: 生产环境的数据库文件存在哪里？**
A: 默认情况下，SQLite 数据库文件 `database.sqlite` 会生成在项目根目录（即运行 Node 命令的当前工作目录）。在容器化部署（如 Docker）时，建议将该文件所在的目录挂载为持久化数据卷（Volume），以防数据丢失。
