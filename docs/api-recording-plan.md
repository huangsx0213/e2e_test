# 🌐 API 录制引擎最佳实践方案 (Implemented)

针对业务场景：**通过 UI 漫游自动生成纯 API 测试资产和链路**。
目前系统已完整实现了高效、降噪、环境感知的 API 录制引擎。

## 已实现核心特性

### 1. 环境感知映射 (Environment-Aware Mapping)
> [!IMPORTANT]
> **自动解耦**：系统在录制时会自动解析请求 URL，将 Origin（如 `https://api.staging.com`）映射到当前活动环境的 `baseUrl`，而将 Path 存入 Endpoint 模型。
> **跨环境复用**：这份资产在执行时，会自动根据当前选择的运行环境切换 Base URL，无需人工修改脚本。

### 2. 智能合并机制 (Intelligent Upsert)
为了防止资产库膨胀和重复，录制引擎采用“增量更新”而非“重复创建”逻辑：
*   **端点匹配**：基于 `[Method] + Path` 进行唯一性校验。
*   **参数合并**：如果新录制到了不同的 Query Parameters，会自动合并到现有 Endpoint 的参数列表中。
*   **Base URL 补全**：如果在不同环境下录制同一个接口，系统会不断完善该 Endpoint 的 `baseUrls` 地图。

### 3. 数据降噪与提纯 (Data Purification)
*   **响应式拦截**：监听 `requestfinished` 以捕获状态码（如 200, 404），确保录制的是有效的业务交互。
*   **Header 清洗**：自动剔除浏览器指纹（User-Agent, Sec-CH-* 等）和易变的 Content-Length。
*   **Body 格式化**：对捕获的 JSON 数据进行标准格式化存入 Body Templates，便于后期维护。

### 4. 实时反馈与同步 (Real-time Sync)
*   **WebSocket 回显**：录制到的 API 步骤会立即通过 WebSocket 发送到 `TestBuilder` 界面，实现零延迟可视化。
*   **资产热刷新**：当新 API 录制完成时，前端会自动触发 Endpoint/Header/Body 资产库更新，确保在测试步骤中可立即选用新录制的配置。

### 5. 执行引擎集成 (Executor Integration)
*   **默认回退**：如果某环境未配置 Base URL，执行器会尝试使用 `default` 路径，保证测试连续性。
*   **自动断言**：录制时自动根据响应状态码生成 `expect(status).toBe(200)` 等基础断言。

## 使用指南
1.  **选择环境**：在录制前，请确保在顶部导航栏选择了正确的“当前环境”（如 STAGING）。
2.  **启动录制**：在 Test Builder 中输入目标 URL 并开启 API 录制。
3.  **资产核对**：录制完成后，可在 API Assets -> Endpoints 中看到按环境归类的 Base URL 地址。
