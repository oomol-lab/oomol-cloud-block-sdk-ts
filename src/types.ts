/**
 * Possible states of a block task during its lifecycle.
 * - `pending`: Task is queued and waiting to be processed
 * - `running`: Task is currently being executed
 * - `success`: Task completed successfully
 * - `failed`: Task failed with an error
 */
export type TaskStatus = "pending" | "running" | "success" | "failed";

/**
 * Request payload for creating a new block task.
 */
export interface BlockTaskRequest {
  /** The name of the block to execute */
  blockName: string;
  /** The package name containing the block */
  packageName: string;
  /** The package version. @default "latest" */
  packageVersion: string;
  /** Input values to pass to the block */
  inputValues: Record<string, unknown>;
  /** Optional webhook URL to receive task completion notifications */
  webhookUrl?: string;
  /** Optional metadata to attach to the task */
  metadata?: Record<string, unknown>;
}

/**
 * Response returned after creating a block task.
 */
export interface BlockTaskResponse {
  /** The unique identifier of the created task */
  taskID: string;
}

/**
 * Response containing the result of a block task.
 * @template T - Type of the result data
 */
export interface TaskResultResponse<T = unknown> {
  /** Current status of the task */
  status: TaskStatus;
  /** Progress percentage (0-100), only available when task is running */
  progress?: number;
  /** Result data returned by the task on success */
  resultData?: T;
  /** Result file URL (if available) */
  resultURL?: string;
  /** Error message if the task failed */
  error?: string;
}

/**
 * Strategy for polling interval backoff.
 */
export enum BackoffStrategy {
  /** Use a fixed interval between polls */
  Fixed = "fixed",
  /** Increase interval exponentially between polls (recommended for long-running tasks) */
  Exponential = "exp",
}

/**
 * Options for awaiting task completion.
 */
export interface AwaitOptions {
  /** Base polling interval in milliseconds. @default 3000 */
  intervalMs?: number;
  /** Maximum time to wait for task completion in milliseconds. If exceeded, throws TimeoutError */
  timeoutMs?: number;
  /** Callback invoked on each poll with current progress and status */
  onProgress?: (progress: number | undefined, status: TaskStatus) => void;
  /** AbortSignal to cancel the polling operation */
  signal?: AbortSignal;
  /** Backoff configuration for polling intervals */
  backoff?: {
    /** Backoff strategy to use. @default BackoffStrategy.Exponential */
    strategy?: BackoffStrategy;
    /** Maximum interval between polls in milliseconds. @default 3000 */
    maxIntervalMs?: number;
  };
}

/**
 * Configuration options for the OomolBlockClient.
 */
export interface ClientOptions {
  /** API key for authentication */
  apiKey: string;
  /** Base URL of the task API. @default "https://cloud-task.oomol.com/v1" */
  baseUrl?: string;
  /** Custom fetch implementation (useful for testing or environments without native fetch) */
  fetch?: typeof fetch;
  /** Additional headers to include in all requests */
  defaultHeaders?: Record<string, string>;
}

/**
 * Options for file upload operations.
 */
export interface UploadOptions {
  /** Base URL of the upload API. @default "https://llm.oomol.com/api/tasks/files/remote-cache" */
  uploadBaseUrl?: string;
  /** Progress callback function (0-100) */
  onProgress?: (progress: number) => void;
  /** Number of retry attempts for failed uploads. @default 3 */
  retries?: number;
  /** AbortSignal to cancel the upload operation */
  signal?: AbortSignal;
}

/**
 * Parameters for listing blocks in a package.
 */
export interface ListBlocksRequest {
  /** Package name */
  packageName: string;
  /** Package version */
  packageVersion: string;
  /** Language code (optional), e.g., "zh-CN" */
  lang?: string;
}

/**
 * Block type enumeration.
 */
export type BlockType = "task" | "subflow";

/**
 * Block input handle definition.
 */
export interface BlockInputHandle {
  handle: string;
  description?: string;
  jsonSchema?: unknown;
  nullable?: boolean;
  value?: unknown;
}

/**
 * Block output handle definition.
 */
export interface BlockOutputHandle {
  handle: string;
  description?: string;
  jsonSchema?: unknown;
  nullable?: boolean;
}

/**
 * Block information structure.
 */
export interface BlockInfo {
  type: BlockType;
  resourceName: string;
  name: string;
  title?: string;
  description?: string;
  icon?: string;
  inputHandleDefs?: BlockInputHandle[];
  outputHandleDefs?: BlockOutputHandle[];
}
