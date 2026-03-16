# OOMOL Cloud Task SDK

[![npm version](https://badge.fury.io/js/oomol-cloud-task-sdk.svg)](https://www.npmjs.com/package/oomol-cloud-task-sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

用于调用 OOMOL Cloud Task API v3 的 TypeScript/JavaScript SDK。

## 特性

- 支持 `serverless` / `applet` / `api_applet` / `web_task` 四类任务创建
- 覆盖常用用户侧 API：任务创建、列表、最新任务、详情、结果、dashboard
- 支持暂停/恢复当前用户任务队列
- 提供 `awaitResult` / `createAndWait`，简化轮询等待流程
- 请求失败会继续轮询，直到超时或拿到明确任务终态
- 完整类型定义与统一错误类型（`ApiError`、`RunBlockError`、`TaskFailedError`、`TimeoutError`、`UploadError`）
- 支持大文件分片上传（浏览器环境）

## 安装

```bash
npm install oomol-cloud-task-sdk
```

## 运行环境

- 推荐 Node.js `>=18`（需要原生 `fetch`）
- 使用 `uploadFile` 时需要 `File` 和 `XMLHttpRequest`（推荐浏览器环境）

## 鉴权说明

Cloud Task v3 主要支持基于 cookie（`oomol-token`）鉴权，SDK 默认 `credentials: "include"`。

- cookie 场景：可不传 `apiKey`
- token 场景：可传 `apiKey`，SDK 会附加 `Authorization: Bearer <apiKey>`

```ts
import { OomolBlockClient } from "oomol-cloud-task-sdk";

const client = new OomolBlockClient({
  // cookie 场景可省略 apiKey
  // apiKey: "your-token",
  credentials: "include", // 默认值
});
```

## 快速开始

```ts
import { OomolBlockClient } from "oomol-cloud-task-sdk";

const client = new OomolBlockClient({});

const { taskID, result } = await client.createAndWait(
  {
    type: "serverless",
    packageName: "@oomol/my-package",
    packageVersion: "1.0.0",
    blockName: "main",
    inputValues: { text: "hello" },
  },
  {
    intervalMs: 2000,
    timeoutMs: 10 * 60 * 1000,
    onProgress: (progress, status) => {
      console.log("progress:", progress, "status:", status);
    },
  }
);

console.log("taskID:", taskID);
if (result.status === "success") {
  console.log("resultURL:", result.resultURL);
  console.log("resultData:", result.resultData);
}
```

## API 一览

| 方法 | 说明 |
| --- | --- |
| `createTask(request)` | 创建任务 |
| `createAndWait(request, awaitOptions?)` | 创建并等待任务完成 |
| `listTasks(query?)` | 获取任务列表 |
| `getLatestTasks(workloadIDs)` | 批量获取 workload 的最新任务 |
| `getTask(taskID)` / `getTaskDetail(taskID)` | 获取任务详情 |
| `getTaskResult(taskID)` | 获取任务结果 |
| `awaitResult(taskID, options?)` | 轮询等待结果 |
| `getDashboard()` | 获取用户 dashboard |
| `setTasksPause(paused)` | 暂停或恢复当前用户任务队列 |
| `pauseUserQueue()` | 暂停当前用户任务队列 |
| `resumeUserQueue()` | 恢复当前用户任务队列 |
| `listBlocks({ packageName, packageVersion, lang? })` | 列出包公开 block |
| `uploadFile(file, options?)` | 分片上传文件，返回可访问 URL |

## 常用示例

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

// 也支持逗号分隔字符串
const latest2 = await client.getLatestTasks(
  "550e8400-e29b-41d4-a716-446655440022,550e8400-e29b-41d4-a716-446655440023"
);

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

### 暂停/恢复用户队列

```ts
await client.pauseUserQueue();

const dashboard = await client.getDashboard();
console.log(dashboard.pause.paused, dashboard.pause.type, dashboard.pause.canResume);

await client.resumeUserQueue();

// 或者使用统一入口
await client.setTasksPause(true);
await client.setTasksPause(false);
```

### 查询公开 Blocks

```ts
const blocks = await client.listBlocks({
  packageName: "@oomol/my-package",
  packageVersion: "1.0.0",
  lang: "zh-CN",
});
```

### 文件上传

```ts
const url = await client.uploadFile(file, {
  retries: 3,
  onProgress: (p) => console.log("upload:", p),
});
```

## 参数与行为说明

### `listTasks(query?)`

- `size` 范围：`1 ~ 100`
- 支持筛选：`status`、`taskType`、`workload`、`workloadID`、`packageID`

### `getLatestTasks(workloadIDs)`

- 支持 `string[]` 或逗号分隔 `string`
- 数组场景最多 `50` 个 ID，且不能为空

### `awaitResult(taskID, options?)`

- 不传 `timeoutMs`：持续轮询直到任务成功/失败或外部 `AbortSignal` 取消
- 传入 `timeoutMs`：达到超时后抛出 `TimeoutError`（消息格式：`Task polling timeout after X minutes`）
- 轮询请求本身失败（如网络抖动、短暂服务异常）不会直接判定任务失败，会继续轮询直到超时或拿到明确终态
- 若最终因超时结束且期间出现过请求错误，`TimeoutError.message` 会包含最近一次请求错误信息，便于排查
- 任务明确失败时抛出 `TaskFailedError`，`message` 格式为 `Task failed: <backend message>`
- 默认轮询间隔 `3000ms`
- `backoff.strategy` 可选：
  - `BackoffStrategy.Exponential`（默认）
  - `BackoffStrategy.Fixed`

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

## 错误处理

```ts
import {
  ApiError,
  RunBlockErrorCode,
  TaskFailedError,
  TimeoutError,
  UploadError,
} from "oomol-cloud-task-sdk";

try {
  const res = await client.awaitResult(taskID, { timeoutMs: 60_000 });
  console.log(res);
} catch (err) {
  if (err instanceof TaskFailedError && err.code === RunBlockErrorCode.INSUFFICIENT_QUOTA) {
    console.error("insufficient quota:", err.message);
  } else if (err instanceof TaskFailedError) {
    console.error("task failed:", err.taskID, err.code, err.statusCode, err.message, err.detail);
  } else if (err instanceof TimeoutError) {
    console.error("timeout:", err.message);
  } else if (err instanceof UploadError) {
    console.error("upload error:", err.code, err.statusCode, err.message);
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
