import { OomolCloudBlockError } from "./types";

/**
 * 从 Response 对象中提取错误消息
 */
export async function getResponseErrorMessage(response: Response): Promise<string> {
  try {
    const text = await response.text();
    if (text[0] === "{") {
      const json = JSON.parse(text);
      return json.message || json.error || text;
    }
    return text;
  } catch {
    return response.statusText;
  }
}

/**
 * 创建标准化的错误对象
 */
export function createError(message: string, statusCode?: number, code?: string): OomolCloudBlockError {
  return new OomolCloudBlockError(message, code, statusCode);
}

/**
 * 带重试的异步函数执行器
 */
export async function retryAsync<T>(
  fn: () => Promise<T>,
  options: {
    retries?: number;
    delayMs?: number;
    maxDelayMs?: number;
    onRetry?: (attempt: number, error: Error) => void;
    signal?: AbortSignal;
  } = {},
): Promise<T> {
  const { retries = 3, delayMs = 1000, maxDelayMs = 30000, onRetry, signal } = options;

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= retries; attempt++) {
    // 检查是否已取消
    if (signal?.aborted) {
      throw new DOMException("Operation cancelled", "AbortError");
    }

    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // 如果是 AbortError，直接抛出，不重试
      if (lastError.name === "AbortError") {
        throw lastError;
      }

      // 如果还有重试次数
      if (attempt < retries) {
        onRetry?.(attempt, lastError);

        // 计算延迟时间（指数退避）
        const delay = Math.min(delayMs * Math.pow(2, attempt - 1), maxDelayMs);

        // 等待后重试
        await sleep(delay, signal);
      }
    }
  }

  // 所有重试都失败
  throw createError(
    `Failed after ${retries} attempts: ${lastError?.message || "Unknown error"}`,
    undefined,
    "RETRY_EXHAUSTED",
  );
}

/**
 * 可中断的 sleep 函数
 */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(resolve, ms);

    if (signal) {
      const abortHandler = () => {
        clearTimeout(timeout);
        reject(new DOMException("Sleep cancelled", "AbortError"));
      };

      signal.addEventListener("abort", abortHandler, { once: true });
    }
  });
}

/**
 * 检查是否为网络错误
 */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError && error.message === "Failed to fetch") {
    return true;
  }
  if (error instanceof Error && error.message.includes("network")) {
    return true;
  }
  return false;
}
