# 部署到 Hugging Face Spaces 指南

遵循以下步骤将此项目部署到 Hugging Face Spaces。

## 1. 创建新的 Space
1.  登录 [Hugging Face](https://huggingface.co/)。
2.  点击 **"New"** -> **"Space"**。
3.  给你的 Space 起一个名字。
4.  **SDK 选择**：选择 **Docker**。
5.  **Template**：选择 **Blank** (默认)。
6.  **Public/Private**：根据需要选择（Public 免费，Private 可能需要付费或限制）。
7.  点击 **"Create Space"**。

## 2. 配置环境变量 (API Key)
由于项目依赖 Gemini AI，你需要配置 API 密钥：
1.  进入新建的 Space 页面。
2.  点击 **"Settings"** 标签。
3.  滚动到 **"Variables and secrets"** 部分。
4.  点击 **"New secret"**。
5.  **Name**: `GEMINI_API_KEY`
6.  **Value**: 输入你的 Google AI Studio API Key。
7.  点击 **"Save"**。

## 3. 推送代码
你可以通过 Web 界面上传文件，或者使用 Git：

```bash
# 添加 HF 远程仓库 (替换你的用户名和 Space 名)
git remote add hf https://huggingface.co/spaces/你的用户名/你的Space名

# 推送代码
git push hf main
```

## 4. 运行与查看
*   推送代码后，Hugging Face 会自动运行 Docker 构建。
*   构建完成后，你的项目将运行在 `https://huggingface.co/spaces/你的用户名/你的Space名`。
*   **注意**：由于本次部署未配置持久化存储，每次 Space 重启（例如闲置过久或重新打包）后，数据库都会自动运行 `seed` 数据进行重置。

## 常见问题
*   **构建失败?** 检查 `Dockerfile` 和 `package.json` 是否已同步。
*   **浏览器测试运行失败?** 确保使用的是 `mcr.microsoft.com/playwright` 镜像，并且容器有足够的资源（建议至少 2 vCPU, 8GB RAM，HF 默认基础型号通常足够）。
