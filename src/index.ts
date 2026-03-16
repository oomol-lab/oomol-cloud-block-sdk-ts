import { ApiError, RunTaskErrorCode, TaskFailedError, TimeoutError, UploadError } from "./errors.js";
import {
  AwaitOptions,
  BackoffStrategy,
  ClientOptions,
  CreateTaskRequest,
  CreateTaskResponse,
  DashboardResponse,
  LatestTasksResponse,
  ListTasksQuery,
  SetTasksPauseResponse,
  TaskListResponse,
  TaskResultData,
  TaskDetailResponse,
  TaskResultResponse,
  UploadOptions,
} from "./types.js";

const DEFAULT_BASE_URL = "https://cloud-task.oomol.com";
const DEFAULT_UPLOAD_BASE_URL = "https://llm.oomol.com/api/tasks/files/remote-cache";

interface UploadInitResponse {
  data: {
    upload_id: string;
    part_size: number;
    total_parts: number;
    presigned_urls: Record<number, string>;
  };
}

interface UploadFinalResponse {
  data: {
    url: string;
    expires_at: string;
    file_name: string;
    file_size: number;
    mime_type: string;
  };
}

export class OomolTaskClient {
  private readonly apiKey?: string;
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;
  private readonly defaultHeaders: Record<string, string>;
  private readonly credentials: RequestCredentials;

  constructor(options: ClientOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = this.normalizeBaseUrl(options.baseUrl ?? DEFAULT_BASE_URL);
    this.fetchFn = options.fetch ?? fetch;
    this.defaultHeaders = options.defaultHeaders ?? {};
    this.credentials = options.credentials ?? "include";
  }

  async createTask(request: CreateTaskRequest): Promise<CreateTaskResponse> {
    const res = await this.request("/v3/users/me/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(this.normalizeCreateTaskRequest(request)),
    });
    return res as CreateTaskResponse;
  }

  async listTasks(query: ListTasksQuery = {}): Promise<TaskListResponse> {
    const queryString = this.buildTasksQueryString(query);
    const path = queryString ? `/v3/users/me/tasks?${queryString}` : "/v3/users/me/tasks";
    const res = await this.request(path, { method: "GET" });
    return res as TaskListResponse;
  }

  async getLatestTasks(workloadIDs: string[] | string): Promise<LatestTasksResponse> {
    const normalized = this.normalizeWorkloadIDs(workloadIDs);
    const query = new URLSearchParams({ workloadIDs: normalized });
    const res = await this.request(`/v3/users/me/tasks/latest?${query.toString()}`, { method: "GET" });
    return res as LatestTasksResponse;
  }

  async getDashboard(): Promise<DashboardResponse> {
    const res = await this.request("/v3/users/me/dashboard", { method: "GET" });
    return res as DashboardResponse;
  }

  async setTasksPause(paused: boolean): Promise<SetTasksPauseResponse> {
    const path = paused ? "/v3/user/pause" : "/v3/user/resume";
    const res = await this.request(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    return res as SetTasksPauseResponse;
  }

  async pauseUserQueue(): Promise<SetTasksPauseResponse> {
    return this.setTasksPause(true);
  }

  async resumeUserQueue(): Promise<SetTasksPauseResponse> {
    return this.setTasksPause(false);
  }

  async getTask(taskID: string): Promise<TaskDetailResponse> {
    const res = await this.request(`/v3/users/me/tasks/${encodeURIComponent(taskID)}`, { method: "GET" });
    return res as TaskDetailResponse;
  }

  async getTaskDetail(taskID: string): Promise<TaskDetailResponse> {
    return this.getTask(taskID);
  }

  async getTaskResult<T = TaskResultData>(taskID: string, signal?: AbortSignal): Promise<TaskResultResponse<T>> {
    const res = await this.request(`/v3/users/me/tasks/${encodeURIComponent(taskID)}/result`, {
      method: "GET",
      signal,
    });
    return res as TaskResultResponse<T>;
  }

  async awaitResult<T = TaskResultData>(
    taskID: string,
    options: AwaitOptions = {}
  ): Promise<TaskResultResponse<T>> {
    const intervalBase = options.intervalMs ?? 3000;
    const maxInterval = options.backoff?.maxIntervalMs ?? 3000;
    const strategy = options.backoff?.strategy ?? BackoffStrategy.Exponential;
    const controller = new AbortController();
    const externalSignal = options.signal;
    let timedOut = false;
    if (externalSignal) {
      if (externalSignal.aborted) {
        controller.abort();
      } else {
        externalSignal.addEventListener("abort", () => controller.abort(), { once: true });
      }
    }

    const timeoutMs = options.timeoutMs;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    if (typeof timeoutMs === "number" && timeoutMs > 0) {
      timeoutId = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs);
    }

    try {
      let attempt = 0;
      let lastPollingRequestError: unknown;
      while (true) {
        let result: TaskResultResponse<T>;
        try {
          result = await this.getTaskResult<T>(taskID, controller.signal);
        } catch (error) {
          if (this.isAbortError(error)) {
            if (timedOut) {
              throw this.createTimeoutErrorWithLastPollingError(lastPollingRequestError, timeoutMs);
            }
            throw error;
          }
          // Polling should only stop on explicit task terminal status, timeout, or external abort.
          // Request-level failures (network jitter/server hiccups/etc.) are treated as retryable.
          lastPollingRequestError = error;
          attempt += 1;
          const retryInterval =
            strategy === BackoffStrategy.Exponential
              ? Math.min(maxInterval, intervalBase * Math.pow(1.5, attempt))
              : intervalBase;
          try {
            await this.delay(retryInterval, controller.signal, timedOut);
          } catch (delayError) {
            if (delayError instanceof TimeoutError) {
              throw this.createTimeoutErrorWithLastPollingError(lastPollingRequestError, timeoutMs);
            }
            throw delayError;
          }
          continue;
        }

        if (result.status === "success") {
          return result;
        }
        if (result.status === "failed") {
          throw this.createTaskFailedError(taskID, result.error ?? result);
        }
        options.onProgress?.(result.progress, result.status);
        attempt += 1;
        const nextInterval =
          strategy === BackoffStrategy.Exponential
            ? Math.min(maxInterval, intervalBase * Math.pow(1.5, attempt))
            : intervalBase;
        try {
          await this.delay(nextInterval, controller.signal, timedOut);
        } catch (delayError) {
          if (delayError instanceof TimeoutError) {
            throw this.createTimeoutErrorWithLastPollingError(lastPollingRequestError, timeoutMs);
          }
          throw delayError;
        }
      }
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  async createAndWait<T = TaskResultData>(
    request: CreateTaskRequest,
    awaitOptions: AwaitOptions = {}
  ): Promise<{ taskID: string; result: TaskResultResponse<T> }> {
    const { taskID } = await this.createTask(request);
    const result = await this.awaitResult<T>(taskID, awaitOptions);
    return { taskID, result };
  }

  async uploadFile(file: File, options: UploadOptions = {}): Promise<string> {
    const uploadBaseUrl = options.uploadBaseUrl ?? DEFAULT_UPLOAD_BASE_URL;
    const retries = options.retries ?? 3;
    const { onProgress, signal } = options;

    const fileSize = file.size;
    const fileExtension = (file.name.includes(".") && file.name.split(".").pop()) || "";

    const initResponse = await this.uploadInit(uploadBaseUrl, fileExtension, fileSize, signal);
    const { upload_id, part_size, total_parts, presigned_urls } = initResponse.data;

    await this.uploadParts(
      file,
      part_size,
      total_parts,
      presigned_urls,
      fileSize,
      onProgress,
      retries,
      signal
    );

    const finalUrl = await this.uploadFinal(uploadBaseUrl, upload_id, signal);
    onProgress?.(100);

    return finalUrl;
  }

  private async uploadInit(
    uploadBaseUrl: string,
    fileExtension: string,
    fileSize: number,
    signal?: AbortSignal
  ): Promise<UploadInitResponse> {
    const res = await this.fetchFn(`${uploadBaseUrl}/init`, {
      method: "POST",
      headers: this.buildHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        file_extension: `.${fileExtension}`,
        size: fileSize,
      }),
      credentials: this.credentials,
      signal,
    });

    if (!res.ok) {
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        body = undefined;
      }
      throw new UploadError(`Failed to initialize upload: ${res.status}`, res.status, "INIT_UPLOAD_FAILED");
    }
    return res.json();
  }

  private async uploadParts(
    file: File,
    partSize: number,
    totalParts: number,
    presignedUrls: Record<number, string>,
    fileSize: number,
    onProgress?: (progress: number) => void,
    retries = 3,
    signal?: AbortSignal
  ): Promise<void> {
    const uploadPromises: Promise<void>[] = [];
    const partProgress: Record<number, number> = {};

    const updateProgress = (partNumber: number, loaded: number) => {
      partProgress[partNumber] = loaded;
      const totalUploaded = Object.values(partProgress).reduce((sum, bytes) => sum + bytes, 0);
      const progress = fileSize > 0 ? Math.floor((totalUploaded / fileSize) * 100) : 0;
      onProgress?.(progress >= 100 ? 99 : progress);
    };

    for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
      const start = (partNumber - 1) * partSize;
      const end = Math.min(start + partSize, fileSize);
      const partData = file.slice(start, end);
      const presignedUrl = presignedUrls[partNumber];

      if (!presignedUrl) {
        throw new UploadError(
          `Missing presigned URL for part ${partNumber}`,
          undefined,
          "MISSING_PRESIGNED_URL"
        );
      }

      uploadPromises.push(
        this.uploadPart(partData, presignedUrl, (loaded: number) => updateProgress(partNumber, loaded), retries, signal)
      );
    }

    await Promise.all(uploadPromises);
  }

  private async uploadPart(
    partData: Blob,
    presignedUrl: string,
    onProgress?: (loaded: number) => void,
    retries = 3,
    signal?: AbortSignal
  ): Promise<void> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= retries; attempt++) {
      if (signal?.aborted) {
        throw new UploadError("Upload cancelled", undefined, "UPLOAD_CANCELLED");
      }

      try {
        const xhr = new XMLHttpRequest();
        return await new Promise<void>((resolve, reject) => {
          xhr.upload.addEventListener("progress", (e) => {
            if (e.lengthComputable && onProgress) {
              onProgress(e.loaded);
            }
          });

          xhr.addEventListener("load", () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve();
            } else {
              reject(new UploadError(`Upload failed with status ${xhr.status}`, xhr.status, "UPLOAD_FAILED"));
            }
          });

          xhr.addEventListener("error", () => {
            reject(new UploadError("Network error during upload", undefined, "NETWORK_ERROR"));
          });

          if (signal) {
            signal.addEventListener("abort", () => {
              xhr.abort();
              reject(new UploadError("Upload cancelled", undefined, "UPLOAD_CANCELLED"));
            });
          }

          xhr.open("PUT", presignedUrl);
          xhr.setRequestHeader("Content-Type", "application/octet-stream");
          xhr.send(partData);
        });
      } catch (error) {
        lastError = error as Error;
        if (lastError.name === "UploadError" && (lastError as UploadError).code === "UPLOAD_CANCELLED") {
          throw lastError;
        }
        if (attempt < retries) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 30000);
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }

    throw new UploadError(
      `Failed after ${retries} attempts: ${lastError?.message || "Unknown error"}`,
      undefined,
      "RETRY_EXHAUSTED"
    );
  }

  private async uploadFinal(uploadBaseUrl: string, uploadId: string, signal?: AbortSignal): Promise<string> {
    const res = await this.fetchFn(`${uploadBaseUrl}/${encodeURIComponent(uploadId)}/url`, {
      method: "GET",
      headers: this.buildHeaders(),
      credentials: this.credentials,
      signal,
    });

    if (!res.ok) {
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        body = undefined;
      }
      throw new UploadError(`Failed to get upload URL: ${res.status}`, res.status, "GET_UPLOAD_URL_FAILED");
    }

    const result: UploadFinalResponse = await res.json();
    return result.data.url;
  }

  private async request(path: string, init: RequestInit): Promise<unknown> {
    const url = this.buildUrl(path);
    const headers = this.buildHeaders(init.headers);
    const res = await this.fetchFn(url, { ...init, headers, credentials: init.credentials ?? this.credentials });
    if (!res.ok) {
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        body = undefined;
      }
      throw new ApiError(`Request failed: ${res.status}`, res.status, body);
    }
    const data = await res.json();
    return data;
  }

  private normalizeCreateTaskRequest(request: CreateTaskRequest): Record<string, unknown> {
    const serverlessBody: Record<string, unknown> = {
      type: "serverless",
      packageName: request.packageName,
      packageVersion: request.packageVersion,
      blockName: request.blockName,
    };
    if (request.inputValues !== undefined) {
      serverlessBody.inputValues = request.inputValues;
    }
    return serverlessBody;
  }

  private buildTasksQueryString(query: ListTasksQuery): string {
    const params = new URLSearchParams();
    if (query.size !== undefined) {
      if (!Number.isInteger(query.size) || query.size < 1 || query.size > 100) {
        throw new Error("size must be an integer between 1 and 100");
      }
      params.set("size", String(query.size));
    }
    if (query.nextToken) {
      params.set("nextToken", query.nextToken);
    }
    if (query.status) {
      params.set("status", query.status);
    }
    if (query.taskType) {
      params.set("taskType", query.taskType);
    }
    if (query.workload) {
      params.set("workload", query.workload);
    }
    if (query.workloadID) {
      params.set("workloadID", query.workloadID);
    }
    if (query.packageID) {
      params.set("packageID", query.packageID);
    }
    return params.toString();
  }

  private normalizeWorkloadIDs(workloadIDs: string[] | string): string {
    if (Array.isArray(workloadIDs)) {
      if (workloadIDs.length === 0) {
        throw new Error("workloadIDs cannot be empty");
      }
      if (workloadIDs.length > 50) {
        throw new Error("workloadIDs cannot exceed 50 items");
      }
      const normalizedIDs = workloadIDs.map((id) => id.trim());
      if (normalizedIDs.some((id) => id.length === 0)) {
        throw new Error("workloadIDs must not contain empty items");
      }
      return normalizedIDs.join(",");
    }

    const normalized = workloadIDs.trim();
    if (!normalized) {
      throw new Error("workloadIDs cannot be empty");
    }
    return normalized;
  }

  private buildHeaders(headers?: HeadersInit): Headers {
    const merged = new Headers(this.defaultHeaders);
    if (this.apiKey) {
      merged.set("Authorization", `Bearer ${this.apiKey}`);
    }
    if (headers) {
      const incoming = new Headers(headers);
      incoming.forEach((value, key) => merged.set(key, value));
    }
    return merged;
  }

  private buildUrl(path: string): string {
    const base = this.baseUrl.endsWith("/") ? this.baseUrl.slice(0, -1) : this.baseUrl;
    const p = path.startsWith("/") ? path : `/${path}`;
    return `${base}${p}`;
  }

  private normalizeBaseUrl(baseUrl: string): string {
    const trimmed = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
    return trimmed.replace(/\/v1$/, "");
  }

  private isAbortError(error: unknown): boolean {
    return error instanceof Error && error.name === "AbortError";
  }

  private createTaskFailedError(taskID: string, detail: unknown): TaskFailedError {
    const backendMessage = this.extractBackendErrorMessage(detail);
    const normalizedMessage = backendMessage || "Unknown error";
    const message = `Task failed: ${normalizedMessage}`;
    const isInsufficientQuota = this.isInsufficientQuotaMessage(normalizedMessage);
    return new TaskFailedError(taskID, detail, {
      message,
      code: isInsufficientQuota ? RunTaskErrorCode.INSUFFICIENT_QUOTA : undefined,
      statusCode: isInsufficientQuota ? 402 : undefined,
    });
  }

  private createTimeoutErrorWithLastPollingError(lastPollingError: unknown, timeoutMs?: number): TimeoutError {
    const minutes = typeof timeoutMs === "number" && timeoutMs > 0 ? Math.max(1, Math.round(timeoutMs / 60000)) : 0;
    const baseMessage = minutes > 0 ? `Task polling timeout after ${minutes} minutes` : "Operation timed out";
    if (!lastPollingError) {
      return new TimeoutError(baseMessage);
    }
    const reason = this.extractBackendErrorMessage(lastPollingError) || "unknown polling request error";
    return new TimeoutError(`${baseMessage}. Last polling request error: ${reason}`);
  }

  private extractBackendErrorMessage(detail: unknown): string | null {
    if (detail instanceof ApiError) {
      const bodyMessage = this.extractMessageFromUnknown(detail.body);
      if (bodyMessage) return bodyMessage;
      return detail.message;
    }
    if (detail instanceof Error) {
      return detail.message;
    }
    return this.extractMessageFromUnknown(detail);
  }

  private extractMessageFromUnknown(detail: unknown): string | null {
    if (typeof detail === "string") {
      const msg = detail.trim();
      return msg || null;
    }
    if (!detail || typeof detail !== "object") {
      return null;
    }
    const message = (detail as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return message.trim();
    }
    const error = (detail as { error?: unknown }).error;
    if (typeof error === "string" && error.trim()) {
      return error.trim();
    }
    return null;
  }

  private isInsufficientQuotaMessage(message: string): boolean {
    const lower = message.toLowerCase();
    return (
      lower.includes("insufficient") ||
      lower.includes("quota") ||
      lower.includes("balance") ||
      lower.includes("credit") ||
      lower.includes("余额") ||
      lower.includes("点数") ||
      lower.includes("费用")
    );
  }

  private async delay(ms: number, signal?: AbortSignal, timedOut = false): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        cleanup();
        resolve();
      }, ms);
      const onAbort = () => {
        cleanup();
        if (timedOut) {
          reject(new TimeoutError());
          return;
        }
        reject(this.createAbortError());
      };
      const cleanup = () => {
        clearTimeout(timeoutId);
        signal?.removeEventListener("abort", onAbort);
      };
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }

  private createAbortError(): Error {
    if (typeof DOMException !== "undefined") {
      return new DOMException("The operation was aborted.", "AbortError");
    }
    const err = new Error("The operation was aborted.");
    err.name = "AbortError";
    return err;
  }
}

export * from "./types.js";
export * from "./errors.js";
