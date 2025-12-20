import { ApiError, TaskFailedError, TimeoutError, UploadError } from "./errors.js";
import {
  AwaitOptions,
  BackoffStrategy,
  BlockInfo,
  BlockTaskRequest,
  BlockTaskResponse,
  ClientOptions,
  ListBlocksRequest,
  TaskResultResponse,
  UploadOptions,
} from "./types.js";

const DEFAULT_BASE_URL = "https://cloud-task.oomol.com/v1";
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

export class OomolBlockClient {
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;
  private readonly defaultHeaders: Record<string, string>;
  private readonly credentials: boolean;

  constructor(options: ClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.fetchFn = options.fetch ?? fetch;
    this.defaultHeaders = options.defaultHeaders ?? {};
    this.credentials = options.credentials ?? true;
  }

  async createTask(request: BlockTaskRequest): Promise<BlockTaskResponse> {
    const body: Record<string, unknown> = {
      blockName: request.blockName,
      packageName: request.packageName,
      packageVersion: request.packageVersion,
      inputValues: request.inputValues,
    };
    if (request.webhookUrl) body.webhookUrl = request.webhookUrl;
    if (request.metadata) body.metadata = request.metadata;

    const res = await this.request("/task/serverless", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res as BlockTaskResponse;
  }

  async getTaskResult<T = unknown>(taskID: string): Promise<TaskResultResponse<T>> {
    const res = await this.request(`/task/${taskID}/result`, { method: "GET" });
    return res as TaskResultResponse<T>;
  }

  async awaitResult<T = unknown>(
    taskID: string,
    options: AwaitOptions = {}
  ): Promise<TaskResultResponse<T>> {
    const intervalBase = options.intervalMs ?? 3000;
    const maxInterval = options.backoff?.maxIntervalMs ?? 3000;
    const strategy = options.backoff?.strategy ?? BackoffStrategy.Exponential;
    const controller = new AbortController();
    const externalSignal = options.signal;
    let aborted = false;
    if (externalSignal) {
      if (externalSignal.aborted) aborted = true;
      externalSignal.addEventListener("abort", () => {
        aborted = true;
        controller.abort();
      });
    }

    const timeoutMs = options.timeoutMs;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    if (typeof timeoutMs === "number" && timeoutMs > 0) {
      timeoutId = setTimeout(() => {
        aborted = true;
        controller.abort();
      }, timeoutMs);
    }

    try {
      let attempt = 0;
      while (true) {
        if (aborted) throw new TimeoutError();
        const result = await this.getTaskResult<T>(taskID);
        if (result.status === "success") {
          return result;
        }
        if (result.status === "failed") {
          throw new TaskFailedError(taskID, result.error ?? result);
        }
        options.onProgress?.(result.progress, result.status);
        attempt += 1;
        const nextInterval =
          strategy === BackoffStrategy.Exponential
            ? Math.min(maxInterval, intervalBase * Math.pow(1.5, attempt))
            : intervalBase;
        await new Promise((r) => setTimeout(r, nextInterval));
      }
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  async createAndWait<T = unknown>(
    request: BlockTaskRequest,
    awaitOptions: AwaitOptions = {}
  ): Promise<{ taskID: string; result: TaskResultResponse<T> }> {
    const { taskID } = await this.createTask(request);
    const result = await this.awaitResult<T>(taskID, awaitOptions);
    return { taskID, result };
  }

  async listBlocks(request: ListBlocksRequest): Promise<BlockInfo[]> {
    const { packageName, packageVersion, lang } = request;
    const url = new URL(
      `https://registry.oomol.com/-/oomol/packages/${packageName}/${packageVersion}/public-blocks`
    );
    if (lang) {
      url.searchParams.set("lang", lang);
    }

    const res = await this.fetchFn(url.toString(), { method: "GET" });
    if (!res.ok) {
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        body = undefined;
      }
      throw new ApiError(`Failed to list blocks: ${res.status}`, res.status, body);
    }
    return res.json();
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        file_extension: `.${fileExtension}`,
        size: fileSize,
      }),
      credentials: "include",
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
      credentials: "include",
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
    const headers = {
      ...this.defaultHeaders,
      ...(init.headers ?? {}),
    } as Record<string, string>;
    const res = await this.fetchFn(url, {
      ...init,
      headers,
      credentials: this.credentials ? "include" : "omit",
    });
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

  private buildUrl(path: string): string {
    const base = this.baseUrl.endsWith("/") ? this.baseUrl.slice(0, -1) : this.baseUrl;
    const p = path.startsWith("/") ? path : `/${path}`;
    return `${base}${p}`;
  }
}

export * from "./types.js";
export * from "./errors.js";
