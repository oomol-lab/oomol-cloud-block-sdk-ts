/**
 * OOMOL Cloud Block SDK 使用示例
 */

import { OomolCloudBlockSDK, type TaskResultResponse } from "../src";

// ============================================
// 示例 1: 基本使用 - 创建并执行任务
// ============================================
async function example1_basicUsage() {
  console.log("\n=== 示例 1: 基本使用 ===\n");

  const sdk = new OomolCloudBlockSDK();

  try {
    const result = await sdk.runTask(
      {
        blockName: "example-block",
        packageName: "example-package",
        packageVersion: "1.0.0",
        inputValues: {
          text: "Hello, OOMOL!",
        },
      },
      {
        onProgress: (progress) => {
          console.log(`进度: ${progress}%`);
        },
      }
    );

    console.log("任务完成!");
    console.log("结果数据:", result.resultData);
    console.log("结果 URL:", result.resultURL);
  } catch (error) {
    console.error("任务失败:", error);
  }
}

// ============================================
// 示例 2: 分步执行
// ============================================
async function example2_stepByStep() {
  console.log("\n=== 示例 2: 分步执行 ===\n");

  const sdk = new OomolCloudBlockSDK();

  try {
    // 步骤 1: 创建任务
    console.log("创建任务...");
    const { taskID } = await sdk.createTask({
      blockName: "text-processor",
      packageName: "text-tools",
      packageVersion: "latest",
      inputValues: {
        text: "Process this text",
      },
    });
    console.log("任务 ID:", taskID);

    // 步骤 2: 手动查询一次状态
    console.log("\n查询任务状态...");
    const status = await sdk.getTaskResult(taskID);
    console.log("当前状态:", status.status);

    // 步骤 3: 等待任务完成
    console.log("\n等待任务完成...");
    const result = await sdk.awaitTaskResult(taskID, {
      intervalMs: 2000,
      onProgress: (progress) => {
        console.log(`进度: ${progress}%`);
      },
    });

    console.log("\n任务完成:", result.resultData);
  } catch (error) {
    console.error("错误:", error);
  }
}

// ============================================
// 示例 3: 文件上传
// ============================================
async function example3_fileUpload() {
  console.log("\n=== 示例 3: 文件上传 ===\n");

  const sdk = new OomolCloudBlockSDK();

  // 创建一个模拟文件（在浏览器中，你会从 input[type="file"] 获取）
  const blob = new Blob(["This is a test file content"], { type: "text/plain" });
  const file = new File([blob], "test.txt", { type: "text/plain" });

  try {
    console.log("开始上传文件...");
    const fileUrl = await sdk.uploadFile(file, {
      onProgress: (progress) => {
        console.log(`上传进度: ${progress}%`);
      },
      retries: 3,
    });

    console.log("\n文件上传成功!");
    console.log("文件 URL:", fileUrl);

    // 使用上传的文件创建任务
    console.log("\n使用上传的文件创建任务...");
    const result = await sdk.runTask({
      blockName: "file-processor",
      packageName: "file-tools",
      packageVersion: "1.0.0",
      inputValues: {
        fileUrl: fileUrl,
      },
    });

    console.log("任务完成:", result.resultData);
  } catch (error) {
    console.error("错误:", error);
  }
}

// ============================================
// 示例 4: 取消操作
// ============================================
async function example4_cancellation() {
  console.log("\n=== 示例 4: 取消操作 ===\n");

  const sdk = new OomolCloudBlockSDK();
  const controller = new AbortController();

  // 3 秒后取消操作
  setTimeout(() => {
    console.log("\n取消任务...");
    controller.abort();
  }, 3000);

  try {
    console.log("开始执行任务（3 秒后将被取消）...");
    const result = await sdk.runTask(
      {
        blockName: "long-task",
        packageName: "tools",
        packageVersion: "1.0.0",
        inputValues: {},
      },
      {
        signal: controller.signal,
        onProgress: (progress) => {
          console.log(`进度: ${progress}%`);
        },
      }
    );

    console.log("任务完成:", result);
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      console.log("✓ 任务已被成功取消");
    } else {
      console.error("错误:", error);
    }
  }
}

// ============================================
// 示例 5: 批量任务
// ============================================
async function example5_batchTasks() {
  console.log("\n=== 示例 5: 批量任务 ===\n");

  const sdk = new OomolCloudBlockSDK();

  const inputs = ["输入 A", "输入 B", "输入 C"];

  try {
    // 并行创建多个任务
    console.log("创建批量任务...");
    const taskPromises = inputs.map((input) =>
      sdk.createTask({
        blockName: "batch-processor",
        packageName: "batch-tools",
        packageVersion: "1.0.0",
        inputValues: { input },
      })
    );

    const tasks = await Promise.all(taskPromises);
    console.log("创建的任务 IDs:", tasks.map((t) => t.taskID));

    // 并行等待所有任务完成
    console.log("\n等待所有任务完成...");
    const resultPromises = tasks.map((task, index) =>
      sdk.awaitTaskResult(task.taskID, {
        onProgress: (progress) => {
          console.log(`任务 ${index + 1}: ${progress}%`);
        },
      })
    );

    const results = await Promise.all(resultPromises);

    console.log("\n所有任务完成!");
    results.forEach((result, index) => {
      console.log(`任务 ${index + 1} 结果:`, result.resultData);
    });
  } catch (error) {
    console.error("错误:", error);
  }
}

// ============================================
// 示例 6: 错误处理
// ============================================
async function example6_errorHandling() {
  console.log("\n=== 示例 6: 错误处理 ===\n");

  const sdk = new OomolCloudBlockSDK();

  try {
    // 尝试创建一个可能失败的任务
    const result = await sdk.runTask(
      {
        blockName: "failing-block",
        packageName: "test-package",
        packageVersion: "1.0.0",
        inputValues: { shouldFail: true },
      },
      {
        maxTimeoutMs: 60000, // 1 分钟超时
      }
    );

    console.log("任务成功:", result);
  } catch (error) {
    if (error instanceof Error) {
      console.error("捕获到错误:");
      console.error("- 类型:", error.constructor.name);
      console.error("- 消息:", error.message);

      // 检查是否是 SDK 的自定义错误
      if ("code" in error) {
        console.error("- 错误码:", (error as any).code);
      }
      if ("statusCode" in error) {
        console.error("- HTTP 状态码:", (error as any).statusCode);
      }
    }
  }
}

// ============================================
// 示例 7: 自定义配置
// ============================================
async function example7_customConfig() {
  console.log("\n=== 示例 7: 自定义配置 ===\n");

  // 使用自定义配置创建 SDK 实例
  const sdk = new OomolCloudBlockSDK({
    taskApiBase: "https://cloud-task.oomol.com/v1", // 自定义任务 API
    uploadApiBase: "https://llm.oomol.com/api/tasks/files/remote-cache", // 自定义上传 API
    credentials: true, // 是否包含凭证
  });

  console.log("SDK 已使用自定义配置创建");

  try {
    const result = await sdk.runTask({
      blockName: "test-block",
      packageName: "test-package",
      packageVersion: "1.0.0",
      inputValues: {},
    });

    console.log("任务完成:", result);
  } catch (error) {
    console.error("错误:", error);
  }
}

// ============================================
// 运行所有示例
// ============================================
async function runAllExamples() {
  console.log("=".repeat(50));
  console.log("OOMOL Cloud Block SDK 示例集");
  console.log("=".repeat(50));

  const examples = [
    { name: "基本使用", fn: example1_basicUsage },
    { name: "分步执行", fn: example2_stepByStep },
    { name: "文件上传", fn: example3_fileUpload },
    { name: "取消操作", fn: example4_cancellation },
    { name: "批量任务", fn: example5_batchTasks },
    { name: "错误处理", fn: example6_errorHandling },
    { name: "自定义配置", fn: example7_customConfig },
  ];

  // 运行选定的示例（取消注释以运行）
  // await example1_basicUsage();
  // await example2_stepByStep();
  // await example3_fileUpload();
  // await example4_cancellation();
  // await example5_batchTasks();
  // await example6_errorHandling();
  // await example7_customConfig();

  console.log("\n" + "=".repeat(50));
  console.log("提示: 取消注释上面的示例调用以运行它们");
  console.log("=".repeat(50));
}

// 如果直接运行此文件
if (require.main === module) {
  runAllExamples().catch(console.error);
}

// 导出所有示例供外部使用
export {
  example1_basicUsage,
  example2_stepByStep,
  example3_fileUpload,
  example4_cancellation,
  example5_batchTasks,
  example6_errorHandling,
  example7_customConfig,
};
