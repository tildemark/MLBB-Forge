import { NextRequest } from "next/server";
import { spawn } from "child_process";
import path from "path";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function checkAuth(req: NextRequest): boolean {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  const qt = req.nextUrl.searchParams.get("t");
  return auth === `Bearer ${secret}` || qt === secret;
}

const JOB_SCRIPTS: Record<string, string> = {
  heroes:  "scripts/scrape-heroes.ts",
  items:   "scripts/scrape-items.ts",
  spells:  "scripts/scrape-spells.ts",
  emblems: "scripts/scrape-emblems.ts",
  skills:  "scripts/scrape-skills.ts",
  seed:    "scripts/seed-db.ts",
};

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const job = req.nextUrl.searchParams.get("job");
  if (!job || !JOB_SCRIPTS[job]) {
    return new Response("Unknown job", { status: 400 });
  }

  // Prefer DB's active patch version; fall back to env var then hardcoded default
  const latestPatch = await prisma.patchVersion.findFirst({ where: { isLatest: true } });
  const patchVersion =
    req.nextUrl.searchParams.get("patch") ??
    latestPatch?.version ??
    process.env.SCRAPE_PATCH ??
    "1.8.88";

  // turbopackIgnore comments suppress the NFT dynamic-path warning
  const scriptPath = path.join(/* turbopackIgnore: true */ process.cwd(), JOB_SCRIPTS[job]);
  // tsx lives in node_modules/.bin — available in the Docker runner after COPY
  const tsxBin = path.join(/* turbopackIgnore: true */ process.cwd(), "node_modules", ".bin", "tsx");

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (text: string, type: "log" | "error" | "done" = "log") => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ text, type })}\n\n`),
          );
        } catch {
          // Stream may already be closed
        }
      };

      send(`▶ Starting ${job} (patch: ${patchVersion})…`);

      const proc = spawn(tsxBin, [scriptPath], {
        cwd: process.cwd(),
        env: { ...process.env, SCRAPE_PATCH: patchVersion },
        shell: false,
      });

      proc.stdout.on("data", (chunk: Buffer) => {
        for (const line of chunk.toString().split("\n")) {
          if (line.trim()) send(line);
        }
      });

      proc.stderr.on("data", (chunk: Buffer) => {
        for (const line of chunk.toString().split("\n")) {
          // Filter out noisy Node.js/tsx experimental warnings
          if (line.trim() && !line.includes("ExperimentalWarning") && !line.includes("--experimental")) {
            send(line, "error");
          }
        }
      });

      proc.on("close", (code) => {
        send(
          code === 0 ? `✅ Done — exit 0` : `❌ Finished with exit code ${code}`,
          code === 0 ? "done" : "error",
        );
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ done: true, code })}\n\n`),
          );
          controller.close();
        } catch { /* already closed */ }
      });

      proc.on("error", (err) => {
        send(`Failed to start process: ${err.message}`, "error");
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ done: true, code: 1 })}\n\n`),
          );
          controller.close();
        } catch { /* already closed */ }
      });

      // Kill the child if the client disconnects
      req.signal.addEventListener("abort", () => {
        proc.kill("SIGTERM");
        try { controller.close(); } catch { /* ignore */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      Connection: "keep-alive",
    },
  });
}
