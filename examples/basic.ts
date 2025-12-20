import { OomolBlockClient, BackoffStrategy, TaskStatus } from "../src/index.js";

async function main() {
  const client = new OomolBlockClient();

  const { taskID, result } = await client.createAndWait(
    {
      blockName: "my-block",
      packageName: "my-package",
      packageVersion: "1.0.0",
      inputValues: {
        input1: "value1",
        input2: "value2",
      },
    },
    {
      intervalMs: 2000,
      backoff: { strategy: BackoffStrategy.Exponential, maxIntervalMs: 10000 },
      onProgress: (progress: number | undefined, status: TaskStatus) => {
        console.log(`任务进行中: status=${status} progress=${progress ?? 0}%`);
      },
    }
  );

  console.log("任务完成", taskID, result);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
