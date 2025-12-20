# OOMOL Cloud Block SDK

[![npm version](https://badge.fury.io/js/oomol-cloud-block-sdk.svg)](https://www.npmjs.com/package/oomol-cloud-block-sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

OOMOL Cloud Block SDK 是一个用于与 OOMOL Cloud Block API 交互的 TypeScript/JavaScript SDK，支持创建和执行无服务器 Block 任务。

## 特性

- 🚀 **简单易用** - 提供简洁的 API 接口
- 📦 **TypeScript 支持** - 完整的类型定义
- 🔄 **自动轮询** - 内置任务状态轮询机制
- ⬆️ **文件上传** - 支持大文件分片上传
- ♻️ **自动重试** - 内置错误处理和重试机制
- 🎯 **进度跟踪** - 实时进度回调
- 🛑 **可取消** - 支持 AbortController 取消操作

## 安装

```bash
npm install oomol-cloud-block-sdk
```

或使用 yarn:

```bash
yarn add oomol-cloud-block-sdk
```

或使用 pnpm:

```bash
pnpm add oomol-cloud-block-sdk
```

## 快速开始

### 基本使用

```typescript
import { OomolCloudBlockSDK } from "oomol-cloud-block-sdk";

// 创建 SDK 实例
const sdk = new OomolCloudBlockSDK();

// 创建并执行任务
const result = await sdk.runTask(
  {
    blockName: "my-block",
    packageName: "my-package",
    packageVersion: "1.0.0",
    inputValues: {
      input1: "value1",
      input2: "value2",
    },
  },
  {
    onProgress: (progress) => {
      console.log(`进度: ${progress}%`);
    },
  }
);

console.log("任务完成:", result.resultData);
```

### 分步执行

```typescript
import { OomolCloudBlockSDK } from "oomol-cloud-block-sdk";

const sdk = new OomolCloudBlockSDK();

// 步骤 1: 创建任务
const { taskID } = await sdk.createTask({
  blockName: "image-processor",
  packageName: "image-tools",
  packageVersion: "latest",
  inputValues: {
    imageUrl: "https://example.com/image.png",
    filter: "blur",
  },
});

console.log("任务已创建:", taskID);

// 步骤 2: 等待任务完成
const result = await sdk.awaitTaskResult(taskID, {
  intervalMs: 2000, // 每 2 秒轮询一次
  maxTimeoutMs: 10 * 60 * 1000, // 最多等待 10 分钟
  onProgress: (progress) => {
    console.log(`进度: ${progress}%`);
  },
});

if (result.status === "success") {
  console.log("任务成功:", result.resultData);
  console.log("结果 URL:", result.resultURL);
}
```

### 文件上传

```typescript
import { OomolCloudBlockSDK } from "oomol-cloud-block-sdk";

const sdk = new OomolCloudBlockSDK();

// 从 input[type="file"] 获取文件
const fileInput = document.querySelector('input[type="file"]');
const file = fileInput.files[0];

// 上传文件
const fileUrl = await sdk.uploadFile(file, {
  onProgress: (progress) => {
    console.log(`上传进度: ${progress}%`);
  },
  retries: 3, // 失败时重试 3 次
});

console.log("文件已上传:", fileUrl);

// 使用上传的文件 URL 创建任务
const result = await sdk.runTask({
  blockName: "document-analyzer",
  packageName: "document-tools",
  packageVersion: "1.0.0",
  inputValues: {
    documentUrl: fileUrl,
  },
});
```

### 取消操作

```typescript
import { OomolCloudBlockSDK } from "oomol-cloud-block-sdk";

const sdk = new OomolCloudBlockSDK();
const controller = new AbortController();

// 5 秒后取消操作
setTimeout(() => {
  controller.abort();
  console.log("操作已取消");
}, 5000);

try {
  const result = await sdk.runTask(
    {
      blockName: "long-running-task",
      packageName: "tools",
      packageVersion: "1.0.0",
      inputValues: {},
    },
    {
      signal: controller.signal,
    }
  );
} catch (error) {
  if (error.name === "AbortError") {
    console.log("任务被用户取消");
  } else {
    console.error("任务失败:", error);
  }
}
```

### 错误处理

```typescript
import { OomolCloudBlockSDK, OomolCloudBlockError } from "oomol-cloud-block-sdk";

const sdk = new OomolCloudBlockSDK();

try {
  const result = await sdk.runTask({
    blockName: "my-block",
    packageName: "my-package",
    packageVersion: "1.0.0",
    inputValues: {},
  });

  console.log("成功:", result);
} catch (error) {
  if (error instanceof OomolCloudBlockError) {
    console.error("SDK 错误:");
    console.error("- 消息:", error.message);
    console.error("- 错误码:", error.code);
    console.error("- 状态码:", error.statusCode);
  } else {
    console.error("未知错误:", error);
  }
}
```

## API 文档

### OomolCloudBlockSDK

主 SDK 类。

#### 构造函数

```typescript
constructor(config?: OomolCloudBlockSDKConfig)
```

**参数:**

- `config.taskApiBase` (可选) - 任务 API 基础 URL，默认 `https://cloud-task.oomol.com/v1`
- `config.uploadApiBase` (可选) - 上传 API 基础 URL，默认 `https://llm.oomol.com/api/tasks/files/remote-cache`
- `config.credentials` (可选) - 是否包含凭证（cookies），默认 `true`

#### 方法

##### `createTask(params: RunBlockParams): Promise<RunBlockResponse>`

创建一个 Block 任务。

**参数:**

- `params.blockName` - Block 名称
- `params.packageName` - Package 名称
- `params.packageVersion` - Package 版本
- `params.inputValues` - 输入参数对象

**返回:** 包含 `taskID` 的响应对象

##### `getTaskResult(taskID: string, signal?: AbortSignal): Promise<TaskResultResponse>`

获取任务执行结果（单次查询）。

**参数:**

- `taskID` - 任务 ID
- `signal` (可选) - AbortSignal，用于取消请求

**返回:** 任务结果对象

##### `awaitTaskResult(taskID: string, options?: AwaitTaskOptions): Promise<TaskResultResponse>`

等待任务完成（自动轮询）。

**参数:**

- `taskID` - 任务 ID
- `options.intervalMs` (可选) - 轮询间隔（毫秒），默认 1000
- `options.maxIntervalMs` (可选) - 最大轮询间隔（毫秒），默认 10000
- `options.maxTimeoutMs` (可选) - 最大超时时间（毫秒），默认 30 分钟
- `options.onProgress` (可选) - 进度回调函数 `(progress: number) => void`
- `options.signal` (可选) - AbortSignal，用于取消轮询

**返回:** 任务完成时的结果（status 为 "success"）

##### `uploadFile(file: File, options?: UploadOptions): Promise<string>`

上传文件到云端缓存。

**参数:**

- `file` - 要上传的文件对象
- `options.signal` (可选) - AbortSignal，用于取消上传
- `options.onProgress` (可选) - 进度回调函数 `(progress: number) => void`
- `options.retries` (可选) - 重试次数，默认 3

**返回:** 上传后的文件 URL

##### `runTask(params: RunBlockParams, awaitOptions?: AwaitTaskOptions): Promise<TaskResultResponse>`

完整流程：创建任务并等待完成。

**参数:**

- `params` - 任务参数（同 `createTask`）
- `awaitOptions` - 等待选项（同 `awaitTaskResult`）

**返回:** 任务完成时的结果

### 类型定义

#### TaskResultResponse

任务结果响应（联合类型）：

```typescript
type TaskResultResponse =
  | {
      status: "pending";
      progress: number; // 0-100
    }
  | {
      status: "success";
      resultURL: string;
      resultData: Record<string, any>;
    }
  | {
      status: "failed";
      failedMessage: string;
    };
```

#### OomolCloudBlockError

SDK 自定义错误类：

```typescript
class OomolCloudBlockError extends Error {
  code?: string; // 错误码
  statusCode?: number; // HTTP 状态码
}
```

常见错误码：

- `CREATE_TASK_FAILED` - 创建任务失败
- `GET_RESULT_FAILED` - 获取结果失败
- `TASK_FAILED` - 任务执行失败
- `POLLING_TIMEOUT` - 轮询超时
- `NETWORK_ERROR` - 网络错误
- `INIT_UPLOAD_FAILED` - 初始化上传失败
- `RETRY_EXHAUSTED` - 重试次数用尽

## 高级用法

### 自定义配置

```typescript
import { OomolCloudBlockSDK } from "oomol-cloud-block-sdk";

const sdk = new OomolCloudBlockSDK({
  taskApiBase: "https://custom-api.example.com/v1",
  uploadApiBase: "https://custom-upload.example.com/api",
  credentials: false, // 不发送 cookies
});
```

### 进度监控

```typescript
const sdk = new OomolCloudBlockSDK();

let lastProgress = 0;

const result = await sdk.runTask(
  {
    blockName: "video-processor",
    packageName: "media-tools",
    packageVersion: "2.0.0",
    inputValues: { videoUrl: "..." },
  },
  {
    onProgress: (progress) => {
      if (progress > lastProgress) {
        console.log(`进度更新: ${lastProgress}% -> ${progress}%`);
        lastProgress = progress;

        // 更新 UI 进度条
        document.getElementById("progress-bar").style.width = `${progress}%`;
      }
    },
  }
);
```

### 批量任务处理

```typescript
const sdk = new OomolCloudBlockSDK();

const tasks = [
  { blockName: "task1", inputValues: { input: "a" } },
  { blockName: "task2", inputValues: { input: "b" } },
  { blockName: "task3", inputValues: { input: "c" } },
];

// 并行创建所有任务
const taskIDs = await Promise.all(
  tasks.map((task) =>
    sdk.createTask({
      ...task,
      packageName: "batch-processor",
      packageVersion: "1.0.0",
    })
  )
);

console.log("创建的任务 IDs:", taskIDs.map((r) => r.taskID));

// 并行等待所有任务完成
const results = await Promise.all(
  taskIDs.map((r) =>
    sdk.awaitTaskResult(r.taskID, {
      onProgress: (progress) => {
        console.log(`任务 ${r.taskID}: ${progress}%`);
      },
    })
  )
);

console.log("所有任务完成:", results);
```

## 开发

```bash
# 安装依赖
npm install

# 开发模式（监听文件变化）
npm run dev

# 构建
npm run build
```

## 许可证

MIT

## 贡献

欢迎提交 Issue 和 Pull Request！

## 支持

如有问题，请访问 [GitHub Issues](https://github.com/your-org/oomol-cloud-block-sdk/issues)
