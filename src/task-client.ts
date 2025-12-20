import type {
  RunBlockParams,
  RunBlockResponse,
  TaskResultResponse,
  AwaitTaskOptions,
  ListBlocksParams,
  BlockInfo,
} from "./types";
import { createError, getResponseErrorMessage, sleep } from "./utils";

/**
 * 任务 API 客户端
 */
export class TaskClient {
  constructor(
    private readonly apiBase: string,
    private readonly credentials: boolean,
  ) {}

  /**
   * 创建并执行一个 Block 任务
   */
  async createTask(params: RunBlockParams): Promise<RunBlockResponse> {
    try {
      const response = await fetch(`${this.apiBase}/task/serverless`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(params),
        credentials: this.credentials ? "include" : "omit",
      });

      if (!response.ok) {
        const errorMessage = await getResponseErrorMessage(response);
        throw createError(`Failed to create task: ${errorMessage}`, response.status, "CREATE_TASK_FAILED");
      }

      return response.json();
    } catch (error) {
      if (error instanceof Error && error.name === "OomolCloudBlockError") {
        throw error;
      }
      throw createError(
        `Failed to create task: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        "NETWORK_ERROR",
      );
    }
  }

  /**
   * 获取任务执行结果
   */
  async getTaskResult(taskID: string, signal?: AbortSignal): Promise<TaskResultResponse> {
    try {
      const response = await fetch(`${this.apiBase}/task/${taskID}/result`, {
        method: "GET",
        credentials: this.credentials ? "include" : "omit",
        signal,
      });

      if (!response.ok) {
        const errorMessage = await getResponseErrorMessage(response);
        throw createError(`Failed to get task result: ${errorMessage}`, response.status, "GET_RESULT_FAILED");
      }

      return response.json();
    } catch (error) {
      // 如果是 AbortError，直接抛出
      if (error instanceof Error && error.name === "AbortError") {
        throw error;
      }

      if (error instanceof Error && error.name === "OomolCloudBlockError") {
        throw error;
      }

      throw createError(
        `Failed to get task result: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        "NETWORK_ERROR",
      );
    }
  }

  /**
   * 等待任务完成（轮询）
   */
  async awaitTaskResult(taskID: string, options: AwaitTaskOptions = {}): Promise<TaskResultResponse> {
    const {
      intervalMs = 1000,
      maxIntervalMs = 10000,
      maxTimeoutMs = 30 * 60 * 1000, // 默认 30 分钟
      onProgress,
      signal,
    } = options;

    const startTime = Date.now();
    let attempt = 0;

    while (true) {
      // 检查是否已取消
      if (signal?.aborted) {
        throw new DOMException("Task polling cancelled", "AbortError");
      }

      // 检查是否超时
      const elapsedTime = Date.now() - startTime;
      if (elapsedTime > maxTimeoutMs) {
        throw createError(
          `Task polling timeout after ${Math.round(maxTimeoutMs / 1000 / 60)} minutes`,
          undefined,
          "POLLING_TIMEOUT",
        );
      }

      // 获取任务结果
      const result = await this.getTaskResult(taskID, signal);

      // 任务成功
      if (result.status === "success") {
        onProgress?.(100);
        return result;
      }

      // 任务失败
      if (result.status === "failed") {
        throw createError(`Task failed: ${result.failedMessage}`, undefined, "TASK_FAILED");
      }

      // 任务进行中，更新进度
      onProgress?.(result.progress);

      // 计算下一次轮询的延迟时间（指数退避）
      attempt++;
      const delay = Math.min(intervalMs * Math.pow(1.5, attempt), maxIntervalMs);

      // 等待后继续轮询
      await sleep(delay, signal);
    }
  }

  /**
   * 列出指定 package 下的所有 block 信息
   */
  async listBlocks(params: ListBlocksParams): Promise<BlockInfo[]> {
    const { packageName, packageVersion, lang } = params;

    try {
      // 构建 URL
      const url = new URL(
        `https://registry.oomol.com/-/oomol/packages/${packageName}/${packageVersion}/public-blocks`,
      );

      // 添加语言参数（如果提供）
      if (lang) {
        url.searchParams.set("lang", lang);
      }

      const response = await fetch(url.toString(), {
        method: "GET",
      });

      if (!response.ok) {
        const errorMessage = await getResponseErrorMessage(response);
        throw createError(`Failed to list blocks: ${errorMessage}`, response.status, "LIST_BLOCKS_FAILED");
      }

      return response.json();
    } catch (error) {
      if (error instanceof Error && error.name === "OomolCloudBlockError") {
        throw error;
      }
      throw createError(
        `Failed to list blocks: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        "NETWORK_ERROR",
      );
    }
  }
}
