/**
 * Task states from Cloud Task API v3.
 */
export type TaskStatus = "queued" | "scheduling" | "scheduled" | "running" | "success" | "failed";

/**
 * In-progress task states.
 */
export type TaskInProgressStatus = "queued" | "scheduling" | "scheduled" | "running";

/**
 * Final task states.
 */
export type TaskTerminalStatus = "success" | "failed";

/**
 * User task ownership type.
 */
export type TaskType = "user" | "shared";

/**
 * Task workload type.
 */
export type WorkloadType = "serverless" | "applet" | "api_applet" | "web_task";

/**
 * Base request payload for creating a task.
 */
export interface BaseCreateTaskRequest {
  /** Input values passed to the workload */
  inputValues?: Record<string, unknown>;
}

/**
 * Request payload for creating a serverless task.
 * `type` is optional for backward compatibility and defaults to `serverless`.
 */
export interface CreateServerlessTaskRequest extends BaseCreateTaskRequest {
  type?: "serverless";
  packageName: string;
  packageVersion: string;
  blockName: string;
  /**
   * Deprecated in v3 API and ignored by this SDK.
   * Kept for backward compatibility with old callers.
   */
  webhookUrl?: string;
  /**
   * Deprecated in v3 API and ignored by this SDK.
   * Kept for backward compatibility with old callers.
   */
  metadata?: Record<string, unknown>;
}

/**
 * Request payload for creating an applet task.
 */
export interface CreateAppletTaskRequest extends BaseCreateTaskRequest {
  type: "applet";
  appletID: string;
}

/**
 * Request payload for creating an API applet task.
 */
export interface CreateApiAppletTaskRequest extends BaseCreateTaskRequest {
  type: "api_applet";
  appletID: string;
}

/**
 * Request payload for creating a web task.
 */
export interface CreateWebTaskRequest extends BaseCreateTaskRequest {
  type: "web_task";
  projectID: string;
  blockName: string;
}

/**
 * Request payload for creating a task.
 */
export type CreateTaskRequest =
  | CreateServerlessTaskRequest
  | CreateAppletTaskRequest
  | CreateApiAppletTaskRequest
  | CreateWebTaskRequest;

/**
 * Backward-compatible alias of old SDK request type.
 */
export type BlockTaskRequest = CreateServerlessTaskRequest;

/**
 * Response returned after creating a task.
 */
export interface CreateTaskResponse {
  taskID: string;
}

/**
 * Backward-compatible alias of old SDK response type.
 */
export type BlockTaskResponse = CreateTaskResponse;

/**
 * Task list item from `GET /v3/users/me/tasks`.
 */
export interface TaskListItem {
  taskID: string;
  taskType: TaskType;
  ownerID: string;
  subscriptionID: string | null;
  packageID: string | null;
  status: TaskStatus;
  progress: number;
  workload: WorkloadType;
  workloadID: string;
  resultURL: string | null;
  failedMessage: string | null;
  createdAt: number;
  updatedAt: number;
  startTime: number | null;
  endTime: number | null;
  schedulerPayload: Record<string, unknown>;
}

/**
 * Response of `GET /v3/users/me/tasks`.
 */
export interface TaskListResponse {
  tasks: TaskListItem[];
  nextToken: string | null;
}

/**
 * Query options for `GET /v3/users/me/tasks`.
 */
export interface ListTasksQuery {
  size?: number;
  nextToken?: string;
  status?: TaskStatus;
  taskType?: TaskType;
  workload?: WorkloadType;
  workloadID?: string;
  packageID?: string;
}

/**
 * Item from `GET /v3/users/me/tasks/latest`.
 */
export interface LatestTaskItem {
  taskID: string;
  workloadID: string;
  status: TaskStatus;
  progress: number;
  createdAt: number;
  startTime: number | null;
  endTime: number | null;
}

/**
 * Response of `GET /v3/users/me/tasks/latest`.
 */
export type LatestTasksResponse = LatestTaskItem[];

/**
 * Response of `GET /v3/users/me/dashboard`.
 */
export interface DashboardResponse {
  limits: {
    maxConcurrency: number;
    maxQueueSize: number;
  };
  count: {
    queued: number;
    scheduling: number;
    scheduled: number;
    running: number;
  };
  pause: {
    paused: boolean;
    type: string | null;
    canResume: boolean;
  };
}

/**
 * User task detail object.
 */
export interface UserTaskDetail {
  taskType: "user";
  taskID: string;
  status: TaskStatus;
  progress: number;
  workload: WorkloadType;
  workloadID: string;
  schedulerPayload: Record<string, unknown>;
  createdAt: number;
  startTime: number | null;
  endTime: number | null;
  resultURL: string | null;
  failedMessage: string | null;
}

/**
 * Shared task detail object.
 */
export interface SharedTaskDetail {
  taskType: "shared";
  taskID: string;
  packageID: string | null;
  subscriptionID: string | null;
  status: TaskStatus;
  progress: number;
  schedulerPayload: Record<string, unknown>;
  createdAt: number;
  startTime: number | null;
  endTime: number | null;
  resultURL: string | null;
  failedMessage: string | null;
}

/**
 * Response of `GET /v3/users/me/tasks/{taskID}`.
 */
export type TaskDetailResponse = UserTaskDetail | SharedTaskDetail;

/**
 * Result object when task is still running.
 */
export interface TaskResultInProgress {
  status: TaskInProgressStatus;
  progress: number;
}

/**
 * Result item returned in `resultData` when task succeeds.
 */
export type TaskResultDataItem = Record<string, unknown>;

/**
 * Default result data shape returned by Cloud Task API v3.
 */
export type TaskResultData = TaskResultDataItem[];

/**
 * Result object when task succeeded.
 * @template T - Type of resultData returned by the API.
 */
export interface TaskResultSuccess<T = TaskResultData> {
  status: "success";
  resultURL: string | null;
  resultData?: T;
}

/**
 * Result object when task failed.
 */
export interface TaskResultFailed {
  status: "failed";
  error: string | null;
}

/**
 * Response of `GET /v3/users/me/tasks/{taskID}/result`.
 */
export type TaskResultResponse<T = TaskResultData> =
  | TaskResultInProgress
  | TaskResultSuccess<T>
  | TaskResultFailed;

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
  /** Optional timeout in milliseconds. If omitted, polling has no SDK timeout limit. */
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
  /** API key for authentication (optional for cookie-auth scenarios). */
  apiKey?: string;
  /** Base URL of the task API. @default "https://cloud-task.oomol.com" */
  baseUrl?: string;
  /** Custom fetch implementation (useful for testing or environments without native fetch) */
  fetch?: typeof fetch;
  /** Additional headers to include in all requests */
  defaultHeaders?: Record<string, string>;
  /** Credentials mode for fetch. @default "include" */
  credentials?: RequestCredentials;
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
