const { spawnSync } = require("child_process");
const path = require("path");

const here = __dirname;
const node = process.env.GIGATOOL_NODE || process.execPath;
const env = { ...process.env };

function run(script, args) {
  console.log("\n>>> " + path.basename(script) + " " + args.join(" "));
  const r = spawnSync(node, [path.join(here, script), ...args], {
    stdio: "inherit",
    env: { ...env, ELECTRON_RUN_AS_NODE: "1" },
  });
  return r.status || 0;
}

const args = process.argv.slice(2);
const dry = args.includes("--dry");

const a = run("collect.cjs", dry ? ["--dry"] : []);
const b = run("publish.cjs", args);
process.exitCode = a || b;
