export class ApiError extends Error {
  readonly status: number;
  readonly body?: unknown;
  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

export const RunBlockErrorCode = {
  INSUFFICIENT_QUOTA: "INSUFFICIENT_QUOTA",
  PAYMENT_REQUIRED: "PAYMENT_REQUIRED",
} as const;

export type RunBlockErrorCode = (typeof RunBlockErrorCode)[keyof typeof RunBlockErrorCode];

export class RunBlockError extends Error {
  readonly statusCode?: number;
  readonly code?: string;
  constructor(message: string, code?: string, statusCode?: number) {
    super(message);
    this.name = "RunBlockError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class TaskFailedError extends RunBlockError {
  readonly taskID: string;
  readonly detail?: unknown;
  constructor(
    taskID: string,
    detail?: unknown,
    options?: {
      message?: string;
      code?: string;
      statusCode?: number;
    }
  ) {
    super(options?.message ?? "Task execution failed", options?.code, options?.statusCode);
    this.name = "TaskFailedError";
    this.taskID = taskID;
    this.detail = detail;
  }
}

export class TimeoutError extends Error {
  constructor(message = "Operation timed out") {
    super(message);
    this.name = "TimeoutError";
  }
}

export class UploadError extends Error {
  readonly statusCode?: number;
  readonly code?: string;
  constructor(message: string, statusCode?: number, code?: string) {
    super(message);
    this.name = "UploadError";
    this.statusCode = statusCode;
    this.code = code;
  }
}
