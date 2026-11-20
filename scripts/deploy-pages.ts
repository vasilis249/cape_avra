/**
 * Publishes dist/pages (built by `npm run export:html`) to the `gh-pages` branch,
 * which GitHub Pages serves at https://<owner>.github.io/<repo>/.
 *
 *   npm run deploy:pages
 *
 * The branch only ever holds the built static site: each deploy replaces it
 * with a single fresh commit. Source code stays on the working branches.
 */
import { execFileSync } from "node:child_process";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "dist/pages");
const git = (args: string[], cwd: string) => execFileSync("git", args, { cwd, stdio: "inherit" });
const read = (args: string[]) => execFileSync("git", args, { cwd: ROOT }).toString().trim();

async function main() {
  const remote = read(["remote", "get-url", "origin"]);
  const source = read(["rev-parse", "--short", "HEAD"]);
  const tmp = await mkdtemp(path.join(tmpdir(), "cape-avra-pages-"));
  try {
    await cp(SRC, tmp, { recursive: true });
    git(["init", "-q", "-b", "gh-pages"], tmp);
    for (const key of ["user.name", "user.email"]) {
      try {
        git(["config", key, read(["config", key])], tmp);
      } catch {}
    }
    git(["add", "-A"], tmp);
    git(["commit", "-q", "-m", `Deploy static preview from ${source}`], tmp);
    git(["push", "-q", "--force", remote, "gh-pages"], tmp);
    const m = remote.match(/github\.com[:/]([^/]+)\/([^/.]+)/);
    console.log(`✓ pushed gh-pages${m ? ` → https://${m[1]}.github.io/${m[2]}/` : ""}`);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
