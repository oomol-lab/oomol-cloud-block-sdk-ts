import { TaskClient } from "./task-client";
import { UploadClient } from "./upload-client";
import type {
  OomolCloudBlockSDKConfig,
  RunBlockParams,
  RunBlockResponse,
  TaskResultResponse,
  AwaitTaskOptions,
  UploadOptions,
  ListBlocksParams,
  BlockInfo,
} from "./types";

const DEFAULT_TASK_API_BASE = "https://cloud-task.oomol.com/v1";
const DEFAULT_UPLOAD_API_BASE = "https://llm.oomol.com/api/tasks/files/remote-cache";

/**
 * OOMOL Cloud Block SDK 主类
 *
 * @example
 * ```typescript
 * const sdk = new OomolCloudBlockSDK();
 *
 * // 创建任务
 * const { taskID } = await sdk.createTask({
 *   blockName: "my-block",
 *   packageName: "my-package",
 *   packageVersion: "1.0.0",
 *   inputValues: { input1: "value1" }
 * });
 *
 * // 等待任务完成
 * const result = await sdk.awaitTaskResult(taskID, {
 *   onProgress: (progress) => console.log(`Progress: ${progress}%`)
 * });
 * ```
 */
export class OomolCloudBlockSDK {
  private readonly taskClient: TaskClient;
  private readonly uploadClient: UploadClient;

  constructor(config: OomolCloudBlockSDKConfig = {}) {
    const {
      taskApiBase = DEFAULT_TASK_API_BASE,
      uploadApiBase = DEFAULT_UPLOAD_API_BASE,
      credentials = true,
    } = config;

    this.taskClient = new TaskClient(taskApiBase, credentials);
    this.uploadClient = new UploadClient(uploadApiBase);
  }

  /**
   * 创建并执行一个 Block 任务
   *
   * @param params - 任务参数
   * @returns 包含 taskID 的响应对象
   *
   * @example
   * ```typescript
   * const response = await sdk.createTask({
   *   blockName: "text-processor",
   *   packageName: "text-tools",
   *   packageVersion: "1.0.0",
   *   inputValues: {
   *     text: "Hello, World!"
   *   }
   * });
   * console.log(response.taskID);
   * ```
   */
  async createTask(params: RunBlockParams): Promise<RunBlockResponse> {
    return this.taskClient.createTask(params);
  }

  /**
   * 获取任务执行结果
   *
   * @param taskID - 任务 ID
   * @param signal - 可选的 AbortSignal，用于取消请求
   * @returns 任务结果
   *
   * @example
   * ```typescript
   * const result = await sdk.getTaskResult(taskID);
   *
   * if (result.status === "success") {
   *   console.log("Task completed:", result.resultData);
   * } else if (result.status === "pending") {
   *   console.log("Task progress:", result.progress);
   * } else {
   *   console.error("Task failed:", result.failedMessage);
   * }
   * ```
   */
  async getTaskResult(taskID: string, signal?: AbortSignal): Promise<TaskResultResponse> {
    return this.taskClient.getTaskResult(taskID, signal);
  }

  /**
   * 等待任务完成（自动轮询）
   *
   * @param taskID - 任务 ID
   * @param options - 轮询选项
   * @returns 任务完成时的结果（status 为 "success"）
   * @throws 如果任务失败或超时
   *
   * @example
   * ```typescript
   * const controller = new AbortController();
   *
   * try {
   *   const result = await sdk.awaitTaskResult(taskID, {
   *     intervalMs: 2000,           // 轮询间隔 2 秒
   *     maxTimeoutMs: 10 * 60 * 1000, // 最多等待 10 分钟
   *     onProgress: (progress) => {
   *       console.log(`Progress: ${progress}%`);
   *     },
   *     signal: controller.signal
   *   });
   *
   *   console.log("Task completed:", result.resultData);
   * } catch (error) {
   *   console.error("Task failed:", error);
   * }
   * ```
   */
  async awaitTaskResult(taskID: string, options?: AwaitTaskOptions): Promise<TaskResultResponse> {
    return this.taskClient.awaitTaskResult(taskID, options);
  }

  /**
   * 上传文件到云端缓存
   *
   * @param file - 要上传的文件对象
   * @param options - 上传选项
   * @returns 上传后的文件 URL
   *
   * @example
   * ```typescript
   * const file = new File(["content"], "example.txt", { type: "text/plain" });
   *
   * const fileUrl = await sdk.uploadFile(file, {
   *   onProgress: (progress) => {
   *     console.log(`Upload progress: ${progress}%`);
   *   },
   *   retries: 3
   * });
   *
   * console.log("File uploaded:", fileUrl);
   * ```
   */
  async uploadFile(file: File, options?: UploadOptions): Promise<string> {
    return this.uploadClient.uploadFile(file, options);
  }

  /**
   * 完整流程：创建任务并等待完成
   *
   * @param params - 任务参数
   * @param awaitOptions - 等待选项
   * @returns 任务完成时的结果
   *
   * @example
   * ```typescript
   * const result = await sdk.runTask(
   *   {
   *     blockName: "image-processor",
   *     packageName: "image-tools",
   *     packageVersion: "latest",
   *     inputValues: {
   *       imageUrl: "https://example.com/image.png"
   *     }
   *   },
   *   {
   *     onProgress: (progress) => console.log(`${progress}%`)
   *   }
   * );
   *
   * console.log("Result:", result.resultData);
   * ```
   */
  async runTask(params: RunBlockParams, awaitOptions?: AwaitTaskOptions): Promise<TaskResultResponse> {
    const { taskID } = await this.createTask(params);
    return this.awaitTaskResult(taskID, awaitOptions);
  }

  /**
   * 列出指定 package 下的所有 block 信息
   *
   * @param params - 包含 package 名称、版本和可选语言参数
   * @returns Block 信息数组
   *
   * @example
   * ```typescript
   * // 获取英文信息
   * const blocks = await sdk.listBlocks({
   *   packageName: "array",
   *   packageVersion: "0.1.6"
   * });
   *
   * // 获取中文信息
   * const blocksZh = await sdk.listBlocks({
   *   packageName: "array",
   *   packageVersion: "0.1.6",
   *   lang: "zh-CN"
   * });
   *
   * console.log(blocks);
   * ```
   */
  async listBlocks(params: ListBlocksParams): Promise<BlockInfo[]> {
    return this.taskClient.listBlocks(params);
  }
}
