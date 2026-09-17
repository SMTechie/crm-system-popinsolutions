const { spawnSync } = require("node:child_process");
const result = spawnSync(process.execPath, ["--test", "test/integration.test.js"], { stdio: "inherit", env: { ...process.env, RUN_INTEGRATION: "1" } });
process.exitCode = result.status ?? 1;
