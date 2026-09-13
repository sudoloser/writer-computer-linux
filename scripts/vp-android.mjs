import { execSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

const VP_VERSION = "0.3.1-android-fallback";
const PROJECT_ROOT = resolve(import.meta.dirname, "..");
const VP_PKG_DIR = join(PROJECT_ROOT, "node_modules", "vite-plus");
const VP_GLOBAL_DIR = join(
  process.env.PREFIX || "/data/data/com.termux/files/usr",
  "lib",
  "node_modules",
  "vite-plus",
);
const VP_DIR = existsSync(VP_PKG_DIR) ? VP_PKG_DIR : VP_GLOBAL_DIR;

const PNPM_BIN = join(process.env.PREFIX || "/data/data/com.termux/files/usr", "bin", "pnpm");
const pnpmCmd = existsSync("/usr/bin/env") ? "pnpm" : process.execPath;
const pnpmArgs = existsSync("/usr/bin/env") ? [] : [PNPM_BIN];

function resolveBin(pkgName, ...subPath) {
  for (const base of [
    VP_GLOBAL_DIR,
    join(VP_GLOBAL_DIR, "node_modules"),
    VP_DIR,
    join(VP_DIR, "node_modules"),
    join(PROJECT_ROOT, "node_modules"),
    join(PROJECT_ROOT, "apps/desktop/node_modules"),
  ]) {
    const candidate = join(base, pkgName, ...subPath);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, {
    stdio: "inherit",
    cwd: opts.cwd || PROJECT_ROOT,
    env: { ...process.env, ...opts.env },
  });
  return result.status ?? 1;
}

function warn(msg) {
  process.stderr.write(`[vp-android] ${msg}\n`);
}

function pnpmExec(cmd, args) {
  return run(pnpmCmd, [...pnpmArgs, "exec", cmd, ...args]);
}

function ox(resolveArgs) {
  const oxlintBin = resolveBin("oxlint", "bin", "oxlint");
  const oxfmtBin = resolveBin("oxfmt", "bin", "oxfmt");
  if (!oxlintBin || !oxfmtBin) {
    warn("Cannot find oxlint or oxfmt in node_modules");
    return 1;
  }
  const node = process.execPath;
  return resolveArgs({ node, oxlintBin, oxfmtBin });
}

function tscCheck() {
  const tsc = resolveBin("typescript", "bin", "tsc");
  if (!tsc) return pnpmExec("tsc", ["--noEmit"]);
  return run(process.execPath, [tsc, "--noEmit"]);
}

function fmtCheck(args) {
  return ox(({ node, oxfmtBin }) => {
    if (args.includes("--version") || args.includes("-V")) return run(node, [oxfmtBin, "-V"]);
    const check = args.includes("--check");
    const flag = check ? ["--check"] : ["--write"];
    const files = args.filter((a) => !a.startsWith("-"));
    if (files.length) {
      return run(node, [oxfmtBin, ...flag, ...files]);
    }
    return run(node, [oxfmtBin, ...flag, "."]);
  });
}

function lint(args) {
  return ox(({ node, oxlintBin }) => {
    if (args.includes("--version") || args.includes("-V"))
      return run(node, [oxlintBin, "--version"]);
    return run(node, [oxlintBin, ...args]);
  });
}

function check(args) {
  const fix = args.includes("--fix");
  const lintArgs = args.filter((a) => a !== "--fix");
  const fmtArgs = fix
    ? args.filter((a) => a !== "--fix")
    : ["--check", ...args.filter((a) => a !== "--check" && a !== "--fix")];

  let code = 0;
  code = fmtCheck(fmtArgs) || code;
  code = lint(lintArgs) || code;
  code = tscCheck() || code;
  return code;
}

function staged(args) {
  let files;
  try {
    files = execSync("git diff --cached --name-only --diff-filter=ACMR", {
      cwd: PROJECT_ROOT,
      encoding: "utf8",
    })
      .trim()
      .split("\n")
      .filter((f) => /\.(m?ts|tsx|m?js)$/.test(f));
  } catch {
    warn("Could not read staged files from git");
    return 1;
  }
  if (!files.length) return 0;

  return ox(({ node, oxlintBin, oxfmtBin }) => {
    let code = 0;
    code = run(node, [oxfmtBin, "--write", ...files]) || code;
    code = run(node, [oxlintBin, ...args, ...files]) || code;
    return code;
  });
}

function viteCommand(cmd, extra) {
  const viteBin = resolveBin("@voidzero-dev/vite-plus-core", "bin", "vite");
  if (viteBin) {
    const rolldownBinding = resolveBin(
      "@rolldown/binding-android-arm64",
      "rolldown-binding.android-arm64.node",
    );
    const env = rolldownBinding ? { NAPI_RS_NATIVE_LIBRARY_PATH: rolldownBinding } : {};
    return run(process.execPath, [viteBin, cmd, ...extra], { env });
  }
  return pnpmExec("vite", [cmd, ...extra]);
}

function vitestRun(extra) {
  const vitestBin = resolveBin("vitest", "vitest.mjs");
  if (vitestBin) {
    const rolldownBinding = resolveBin(
      "@rolldown/binding-android-arm64",
      "rolldown-binding.android-arm64.node",
    );
    const env = rolldownBinding ? { NAPI_RS_NATIVE_LIBRARY_PATH: rolldownBinding } : {};
    return run(process.execPath, [vitestBin, "run", ...extra], { env });
  }
  return pnpmExec("vitest", ["run", ...extra]);
}

function version() {
  console.log(`vp-android ${VP_VERSION} (fallback for Termux/android-arm64)`);
  return 0;
}

function help() {
  console.log(`vp-android — Termux fallback for vite-plus ${VP_VERSION}

Commands:
  install / i       pnpm install
  exec <cmd>        pnpm exec <cmd>
  run <script>      pnpm run <script>
  dev               vite dev
  build             vite build
  preview           vite preview
  test [args]       vitest run [args]
  lint [args]       oxlint [args]
  fmt [args]        oxfmt [args]
  check [--fix]     oxfmt + oxlint + tsc --noEmit
  staged            oxfmt + oxlint on git-cached .ts/.tsx/.js/.mjs files
  --version         show fallback version
  help              this message

Unsupported (run on desktop): config, hooks, create, migrate, pack, doc, cache, publish`);
  return 0;
}

const args = process.argv.slice(2);
const cmd = args[0];
const rest = args.slice(1);

let code;
switch (cmd) {
  case "install":
  case "i":
    code = run(pnpmCmd, [...pnpmArgs, "install"]);
    break;
  case "exec":
    code = run(pnpmCmd, [...pnpmArgs, "exec", ...rest]);
    break;
  case "run": {
    const scriptArgs = [];
    let filterPkg = null;
    for (const a of rest) {
      const m = a.match(/^([a-zA-Z0-9_-]+)#(.+)$/);
      if (m) {
        filterPkg = m[1];
        scriptArgs.push(m[2]);
      } else {
        scriptArgs.push(a);
      }
    }
    if (filterPkg) {
      code = run(pnpmCmd, [...pnpmArgs, "--filter", filterPkg, "run", ...scriptArgs]);
    } else {
      code = run(pnpmCmd, [...pnpmArgs, "run", ...scriptArgs]);
    }
    break;
  }
  case "dev":
    code = viteCommand("dev", rest);
    break;
  case "build":
    code = viteCommand("build", rest);
    break;
  case "preview":
    code = viteCommand("preview", rest);
    break;
  case "test":
    code = vitestRun(rest);
    break;
  case "lint":
    code = lint(rest);
    break;
  case "fmt":
    code = fmtCheck(rest);
    break;
  case "check":
    code = check(rest);
    break;
  case "staged":
    code = staged(rest);
    break;
  case "--version":
  case "-V":
    code = version();
    break;
  case "help":
  case undefined:
    code = help();
    break;
  default:
    warn(`unknown command '${cmd}'`);
    help();
    code = 1;
}

process.exit(code);
