import axios, { type AxiosProgressEvent } from "axios";
import type { InitUploadResponse, FinalUrlResponse, UploadOptions } from "./types";
import { createError, retryAsync } from "./utils";

/**
 * 文件上传客户端
 */
export class UploadClient {
  constructor(private readonly apiBase: string) {}

  /**
   * 上传文件到云端缓存
   * @returns 上传后的文件 URL
   */
  async uploadFile(file: File, options: UploadOptions = {}): Promise<string> {
    const { onProgress, retries = 3, signal } = options;

    const fileSize = file.size;
    const fileExtension = (file.name.includes(".") && file.name.split(".").pop()) || "";

    // 步骤 1: 初始化上传
    const initResponse = await this.initUpload(fileExtension, fileSize, signal);
    const { upload_id, part_size, total_parts, presigned_urls } = initResponse.data;

    // 步骤 2: 上传所有分片
    await this.uploadParts(file, part_size, total_parts, presigned_urls, fileSize, onProgress, retries, signal);

    // 步骤 3: 获取最终文件 URL
    const finalUrl = await this.getFinalUrl(upload_id, signal);

    onProgress?.(100);

    return finalUrl;
  }

  /**
   * 初始化上传
   */
  private async initUpload(fileExtension: string, fileSize: number, signal?: AbortSignal): Promise<InitUploadResponse> {
    try {
      const response = await fetch(`${this.apiBase}/init`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          file_extension: `.${fileExtension}`,
          size: fileSize,
        }),
        credentials: "include",
        signal,
      });

      if (!response.ok) {
        throw createError(
          `Failed to initialize upload: ${response.statusText}`,
          response.status,
          "INIT_UPLOAD_FAILED",
        );
      }

      return response.json();
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw error;
      }
      throw createError(
        `Failed to initialize upload: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        "NETWORK_ERROR",
      );
    }
  }

  /**
   * 上传所有分片
   */
  private async uploadParts(
    file: File,
    partSize: number,
    totalParts: number,
    presignedUrls: Record<number, string>,
    fileSize: number,
    onProgress?: (progress: number) => void,
    retries?: number,
    signal?: AbortSignal,
  ): Promise<void> {
    const uploadPromises: Promise<void>[] = [];
    const partProgress: Record<number, number> = {};

    const updateProgress = (partNumber: number, loaded: number) => {
      partProgress[partNumber] = loaded;
      const totalUploaded = Object.values(partProgress).reduce((sum, bytes) => sum + bytes, 0);
      const progress = fileSize > 0 ? Math.floor((totalUploaded / fileSize) * 100) : 0;
      onProgress?.(progress >= 100 ? 99 : progress); // 保留最后的 1% 给完成步骤
    };

    for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
      const start = (partNumber - 1) * partSize;
      const end = Math.min(start + partSize, fileSize);
      const partData = file.slice(start, end);
      const presignedUrl = presignedUrls[partNumber];

      if (!presignedUrl) {
        throw createError(`Missing presigned URL for part ${partNumber}`, undefined, "MISSING_PRESIGNED_URL");
      }

      uploadPromises.push(
        this.uploadPart(partData, presignedUrl, (loaded: number) => updateProgress(partNumber, loaded), retries, signal),
      );
    }

    await Promise.all(uploadPromises);
  }

  /**
   * 上传单个分片（带重试）
   */
  private async uploadPart(
    partData: Blob,
    presignedUrl: string,
    onProgress?: (loaded: number) => void,
    retries = 3,
    signal?: AbortSignal,
  ): Promise<void> {
    return retryAsync(
      async () => {
        await axios.put(presignedUrl, partData, {
          headers: {
            "Content-Type": "application/octet-stream",
          },
          onUploadProgress: (progressEvent: AxiosProgressEvent) => {
            if (onProgress && progressEvent.loaded) {
              onProgress(progressEvent.loaded);
            }
          },
          transformRequest: [(data: Blob) => data],
          signal,
        });
      },
      {
        retries,
        delayMs: 1000,
        maxDelayMs: 30000,
        signal,
        onRetry: (attempt, error) => {
          console.warn(`Retrying upload part (attempt ${attempt}/${retries}):`, error.message);
        },
      },
    );
  }

  /**
   * 获取最终文件 URL
   */
  private async getFinalUrl(uploadId: string, signal?: AbortSignal): Promise<string> {
    try {
      const response = await fetch(`${this.apiBase}/${encodeURIComponent(uploadId)}/url`, {
        method: "GET",
        credentials: "include",
        signal,
      });

      if (!response.ok) {
        throw createError(
          `Failed to get upload URL: ${response.statusText}`,
          response.status,
          "GET_UPLOAD_URL_FAILED",
        );
      }

      const result: FinalUrlResponse = await response.json();
      return result.data.url;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw error;
      }
      throw createError(
        `Failed to get upload URL: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        "NETWORK_ERROR",
      );
    }
  }
}
