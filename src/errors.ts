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

export class TaskFailedError extends Error {
  readonly taskID: string;
  readonly detail?: unknown;
  constructor(taskID: string, detail?: unknown) {
    super("Task execution failed");
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
