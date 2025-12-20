/**
 * OOMOL Cloud Block SDK
 *
 * SDK for interacting with OOMOL Cloud Block API to create and execute serverless block tasks.
 *
 * @packageDocumentation
 */

// 主类导出
export { OomolCloudBlockSDK } from "./sdk";

// 类型导出
export type {
  // 配置类型
  OomolCloudBlockSDKConfig,
  // 任务相关类型
  RunBlockParams,
  RunBlockResponse,
  TaskResultResponse,
  AwaitTaskOptions,
  // 上传相关类型
  UploadOptions,
  InitUploadResponse,
  FinalUrlResponse,
  // Block 相关类型
  ListBlocksParams,
  BlockInfo,
  BlockInfoType,
  BlockInfoInputHandleDef,
  BlockInfoOutputHandleDef,
  // 枚举
  TaskStatus,
} from "./types";

// 错误类导出
export { OomolCloudBlockError } from "./types";

// 默认导出
export { OomolCloudBlockSDK as default } from "./sdk";
