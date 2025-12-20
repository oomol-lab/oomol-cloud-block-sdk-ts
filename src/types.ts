/**
 * 任务状态枚举
 */
export enum TaskStatus {
  PENDING = "pending",
  SUCCESS = "success",
  FAILED = "failed",
}

/**
 * 创建任务的参数
 */
export interface RunBlockParams {
  /** Block 名称 */
  readonly blockName: string;
  /** 输入参数 */
  readonly inputValues: Record<string, any>;
  /** Package 名称 */
  readonly packageName: string;
  /** Package 版本，默认 "latest" */
  readonly packageVersion: string;
}

/**
 * 创建任务的响应
 */
export interface RunBlockResponse {
  /** 任务 ID */
  readonly taskID: string;
}

/**
 * 任务结果响应（联合类型）
 */
export type TaskResultResponse =
  | {
      /** 任务执行中 */
      readonly status: "pending";
      /** 进度 0-100 */
      readonly progress: number;
    }
  | {
      /** 任务执行成功 */
      readonly status: "success";
      /** 结果文件 URL */
      readonly resultURL: string;
      /** 结果数据 */
      readonly resultData: Record<string, any>;
    }
  | {
      /** 任务执行失败 */
      readonly status: "failed";
      /** 失败消息 */
      readonly failedMessage: string;
    };

/**
 * 等待任务完成的选项
 */
export interface AwaitTaskOptions {
  /** 轮询间隔（毫秒），默认 1000ms */
  intervalMs?: number;
  /** 最大轮询间隔（毫秒），默认 10000ms */
  maxIntervalMs?: number;
  /** 最大超时时间（毫秒），默认 30 分钟 */
  maxTimeoutMs?: number;
  /** 进度回调函数 */
  onProgress?: (progress: number) => void;
  /** AbortSignal 用于取消任务 */
  signal?: AbortSignal;
}

/**
 * 文件上传初始化响应
 */
export interface InitUploadResponse {
  data: {
    /** 上传 ID */
    upload_id: string;
    /** 每个分片的大小（字节） */
    part_size: number;
    /** 总分片数 */
    total_parts: number;
    /** 预签名 URL 映射（分片编号 -> URL） */
    presigned_urls: Record<number, string>;
  };
}

/**
 * 文件上传完成响应
 */
export interface FinalUrlResponse {
  data: {
    /** 文件访问 URL */
    url: string;
    /** 过期时间 */
    expires_at: string;
    /** 文件名 */
    file_name: string;
    /** 文件大小 */
    file_size: number;
    /** MIME 类型 */
    mime_type: string;
  };
}

/**
 * 文件上传选项
 */
export interface UploadOptions {
  /** AbortSignal 用于取消上传 */
  readonly signal?: AbortSignal;
  /** 进度回调函数（0-100） */
  readonly onProgress?: (progress: number) => void;
  /** 重试次数，默认 3 */
  readonly retries?: number;
}

/**
 * SDK 配置选项
 */
export interface OomolCloudBlockSDKConfig {
  /** 任务 API 基础 URL，默认 https://cloud-task.oomol.com/v1 */
  taskApiBase?: string;
  /** 上传 API 基础 URL，默认 https://llm.oomol.com/api/tasks/files/remote-cache */
  uploadApiBase?: string;
  /** 是否包含凭证（cookies），默认 true */
  credentials?: boolean;
}

/**
 * Block 类型枚举
 */
export type BlockInfoType = "task" | "subflow";

/**
 * Block 输入句柄定义
 */
export interface BlockInfoInputHandleDef {
  readonly handle: string;
  readonly description?: string;
  readonly json_schema?: any;
  readonly nullable?: boolean;
  readonly value?: any;
}

/**
 * Block 输出句柄定义
 */
export interface BlockInfoOutputHandleDef {
  readonly handle: string;
  readonly description?: string;
  readonly json_schema?: any;
  readonly nullable?: boolean;
}

/**
 * Block 信息
 */
export interface BlockInfo {
  readonly type: BlockInfoType;
  readonly resourceName: string;
  readonly name: string;
  readonly title?: string;
  readonly description?: string;
  readonly icon?: string;
  readonly inputHandleDefs?: readonly BlockInfoInputHandleDef[];
  readonly outputHandleDefs?: readonly BlockInfoOutputHandleDef[];
}

/**
 * 列出 Block 的参数
 */
export interface ListBlocksParams {
  /** Package 名称 */
  readonly packageName: string;
  /** Package 版本 */
  readonly packageVersion: string;
  /** 语言代码（可选），例如 "zh-CN" */
  readonly lang?: string;
}

/**
 * 自定义错误类型
 */
export class OomolCloudBlockError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = "OomolCloudBlockError";
  }
}
