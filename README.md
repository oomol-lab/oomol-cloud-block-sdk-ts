# OOMOL Cloud Block SDK

[![npm version](https://badge.fury.io/js/oomol-cloud-block-sdk.svg)](https://www.npmjs.com/package/oomol-cloud-block-sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

用于调用 OOMOL Cloud Task API v3 的 TypeScript/JavaScript SDK。

## 特性

- 支持 `serverless` / `applet` / `api_applet` / `web_task` 四类任务创建
- 完整类型定义（任务列表、详情、结果、dashboard）
- 内置轮询等待（可选超时、退避、AbortSignal）
- `awaitResult` 自动重试瞬时错误（`429/500/502/503/504`）
- 支持大文件分片上传
- 统一错误类型（`ApiError`、`TaskFailedError`、`TimeoutError`、`UploadError`）

## 安装

```bash
npm install oomol-cloud-block-sdk
```

## 快速开始

```ts
import { OomolBlockClient } from "oomol-cloud-block-sdk";

const client = new OomolBlockClient({
  // cookie 场景可省略 apiKey
  // apiKey: "your-token",
});

const { taskID } = await client.createTask({
  type: "serverless",
  packageName: "@oomol/my-package",
  packageVersion: "1.0.0",
  blockName: "main",
  inputValues: {
    text: "hello",
  },
});

const result = await client.awaitResult(taskID, {
  intervalMs: 2000,
  // timeoutMs 不传表示 SDK 不限制超时（推荐由业务层控制）
  // timeoutMs: 10 * 60 * 1000,
  onProgress: (progress, status) => {
    console.log("progress:", progress, "status:", status);
  },
});

if (result.status === "success") {
  console.log("resultURL:", result.resultURL);
  console.log("resultData:", result.resultData);
}
```

## 常用 API

### 创建任务

```ts
await client.createTask({
  type: "applet",
  appletID: "550e8400-e29b-41d4-a716-446655440016",
  inputValues: { foo: "bar" },
});

await client.createTask({
  type: "api_applet",
  appletID: "550e8400-e29b-41d4-a716-446655440016",
});

await client.createTask({
  type: "web_task",
  projectID: "550e8400-e29b-41d4-a716-446655440016",
  blockName: "main",
  inputValues: { foo: "bar" },
});
```

### 查询任务

```ts
// 列表
const page = await client.listTasks({
  size: 20,
  status: "running",
  taskType: "user",
});

// 最新任务（按 workloadIDs）
const latest = await client.getLatestTasks([
  "550e8400-e29b-41d4-a716-446655440022",
  "550e8400-e29b-41d4-a716-446655440023",
]);

// 详情
const detail = await client.getTask("019234a5-b678-7def-8123-456789abcdef");

// 结果
const taskResult = await client.getTaskResult("019234a5-b678-7def-8123-456789abcdef");
```

### Dashboard

```ts
const dashboard = await client.getDashboard();
console.log(dashboard.limits.maxConcurrency);
```

### 文件上传

```ts
const url = await client.uploadFile(file, {
  retries: 3,
  onProgress: (p) => console.log("upload:", p),
});
```

## 类型说明

### `CreateTaskRequest`

联合类型：

- `CreateServerlessTaskRequest`
- `CreateAppletTaskRequest`
- `CreateApiAppletTaskRequest`
- `CreateWebTaskRequest`

### `TaskResultResponse<T>`

联合类型：

- 进行中：`{ status: "queued" | "scheduling" | "scheduled" | "running"; progress: number }`
- 成功：`{ status: "success"; resultURL: string | null; resultData?: T }`
- 失败：`{ status: "failed"; error: string | null }`

默认 `T = TaskResultData`，即 `Record<string, unknown>[]`。

### `awaitResult` 超时行为

- 不传 `timeoutMs`：SDK 持续轮询直到任务成功/失败或外部 `AbortSignal` 取消
- 传入 `timeoutMs`：达到超时后抛出 `TimeoutError`

## 错误处理

```ts
import { ApiError, TaskFailedError, TimeoutError } from "oomol-cloud-block-sdk";

try {
  const res = await client.awaitResult(taskID, { timeoutMs: 60_000 });
  console.log(res);
} catch (err) {
  if (err instanceof TaskFailedError) {
    console.error("task failed:", err.taskID, err.detail);
  } else if (err instanceof TimeoutError) {
    console.error("timeout");
  } else if (err instanceof ApiError) {
    console.error("api error:", err.status, err.body);
  } else {
    console.error(err);
  }
}
```

## ClientOptions

```ts
new OomolBlockClient({
  apiKey: "optional-token",
  baseUrl: "https://cloud-task.oomol.com", // 默认值
  credentials: "include", // 默认值
  defaultHeaders: {
    "x-client": "my-app",
  },
});
```

## 开发

```bash
npm install
npm run build
```

## 许可证

MIT
