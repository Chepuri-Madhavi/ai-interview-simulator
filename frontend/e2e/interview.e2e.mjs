// End-to-end test: real backend (test LLM) + built frontend + Chromium with fake camera/microphone.
// Run from frontend/: npm run build && npm run e2e
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const BACKEND = path.join(ROOT, "backend");
const SAMPLES = path.join(ROOT, "samples");
const SHOTS = process.env.E2E_SHOTS || path.join(tmpdir(), "ais-e2e-shots");
const PORT = 8765;
const BASE = `http://127.0.0.1:${PORT}`;
mkdirSync(SHOTS, { recursive: true });

const tmp = mkdtempSync(path.join(tmpdir(), "ais-e2e-"));
const python = existsSync(path.join(BACKEND, ".venv/bin/python")) ? path.join(BACKEND, ".venv/bin/python") : "python3";
const server = spawn(python, ["-m", "uvicorn", "app.main:app", "--port", String(PORT)], {
  cwd: BACKEND, stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, LLM_PROVIDER: "fake", APP_ENV: "test", DATABASE_URL: `sqlite:///${tmp}/e2e.db`, STORAGE_DIR: `${tmp}/storage`, SECRET_KEY: "e2e" },
});
let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));

const step = (s) => console.log("✓", s);
async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${BASE}/api/health`)).ok) return; } catch { /* starting */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("backend did not start\n" + serverLog);
}

const errors = [];
let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ["camera", "microphone"], acceptDownloads: true });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|fonts\.g/.test(m.text())) errors.push("console: " + m.text()); });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ body: "", contentType: "text/css" }));
  const shot = (n) => page.screenshot({ path: path.join(SHOTS, `${n}.png`), fullPage: true });

  await page.goto(BASE);
  await page.getByRole("heading", { name: /Rehearse the interview/ }).waitFor();
  await shot("01-landing"); step("landing page");

  await page.goto(`${BASE}/dashboard`);
  await page.waitForURL(/\/login\?next=/); step("protected pages redirect to sign-in");
  await page.goto(`${BASE}/register`);
  await page.fill("#name", "Priya Test"); await page.fill("#email", "priya@example.com"); await page.fill("#password", "password123");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/dashboard/); step("registration");

  await page.goto(`${BASE}/new`);
  await page.setInputFiles("#resume-file", { name: "cv.png", mimeType: "image/png", buffer: Buffer.from("x") });
  await page.getByText("Upload a PDF or DOCX file.").waitFor(); step("rejects a non-PDF/DOCX file");
  await page.setInputFiles("#resume-file", path.join(SAMPLES, "sample_resume.pdf"));
  await page.getByText(/Extracted .* characters from sample_resume.pdf/).waitFor();
  if (!(await page.inputValue("#resume-text")).includes("DocuQuery")) throw new Error("resume text not extracted");
  await shot("02-resume"); step("resume PDF extracted on the server");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL(/\/new\/job\?resume=/);
  await page.setInputFiles("#job-file", path.join(SAMPLES, "sample_job_description.docx"));
  await page.getByText(/Extracted .* sample_job_description.docx/).waitFor(); step("job description DOCX extracted");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL(/\/analysis\/\d+$/);
  await page.getByText("Profile match: 72%").waitFor();
  await page.getByText("Missing skills").waitFor();
  await shot("03-analysis"); step("analysis page");

  await page.getByRole("link", { name: "Configure interview" }).click();
  await page.getByRole("radio", { name: "15 min" }).click();
  await page.locator("#count").fill("4");
  await shot("04-configure");
  await page.getByRole("button", { name: "Generate questions" }).click();
  await page.waitForURL(/\/interviews\/\d+\/check/);
  const interviewId = page.url().match(/interviews\/(\d+)/)[1];
  step("questions generated → device check");

  const startBtn = page.locator("#start-interview");
  if (!(await startBtn.isDisabled())) throw new Error("start must be disabled before devices + consent");
  await page.getByRole("button", { name: /Allow camera and microphone/ }).click();
  await page.getByText("Camera on").waitFor();
  await page.getByText("Microphone working").waitFor({ timeout: 15000 });
  const videoLive = await page.evaluate(() => { const v = document.querySelector("video"); return !!v && v.srcObject?.getVideoTracks()[0]?.readyState === "live"; });
  if (!videoLive) throw new Error("camera preview not live");
  step("camera preview live + microphone level detected");
  await page.getByRole("button", { name: "Record test clip" }).click();
  await page.getByLabel("Test clip playback").waitFor({ timeout: 10000 }); step("5-second test clip recorded for playback");
  if (!(await startBtn.isDisabled())) throw new Error("start must require consent");
  await page.check("#consent");
  await shot("05-device-check");
  await startBtn.click();
  await page.waitForURL(/\/room$/);
  await page.locator("#question-text").waitFor();
  await page.getByText("REC", { exact: true }).waitFor({ timeout: 10000 });
  step("interview room: question shown, recording indicator on");

  // Q1: answer with the mic + typed correction, and trigger a follow-up
  await page.getByRole("button", { name: /Start answering/ }).click();
  await page.getByText("Transcribing your answer live").waitFor();
  await page.waitForTimeout(1200);
  await page.fill("#answer", "A good answer about my RAG project, please ask a FOLLOWUP");
  await shot("06-interview-room");
  await page.locator("#submit-btn").click();
  await page.locator("#question-text", { hasText: "Can you give a concrete example?" }).waitFor();
  await page.getByText("Follow-up", { exact: true }).waitFor();
  step("answer submitted → adaptive follow-up question");

  await page.getByRole("button", { name: "Pause" }).click();
  await page.getByRole("dialog", { name: "Interview paused" }).waitFor();
  await page.getByText("Recording paused").waitFor();
  await page.getByRole("dialog", { name: "Interview paused" }).getByRole("button", { name: "Resume" }).click();
  await page.getByRole("dialog", { name: "Interview paused" }).waitFor({ state: "detached" });
  step("pause and resume");

  await page.locator("#submit-btn").click();
  await page.getByText(/No answer yet/).waitFor(); step("empty answers are blocked");
  await page.fill("#answer", "A good concrete example with numbers");
  await page.locator("#submit-btn").click();
  await page.locator("#question-text", { hasText: "(#2)" }).waitFor();
  await page.getByRole("button", { name: "Skip question" }).click();
  await page.locator("#question-text", { hasText: "(#3)" }).waitFor();
  await page.waitForTimeout(5500); // let at least one 5-second video chunk upload
  await page.getByRole("button", { name: "End interview" }).click();
  await page.getByRole("button", { name: "End and get report" }).click();
  await page.waitForURL(/\/report$/);
  await page.getByText("Answer-by-answer feedback").waitFor({ timeout: 30000 });
  step("ended early → report generated");

  const iv = await page.evaluate(async (id) => (await fetch(`/api/interviews/${id}`, { headers: { Authorization: `Bearer ${localStorage.getItem("ais.token")}` } })).json(), interviewId);
  if (!iv.has_recording || iv.recording_bytes < 10_000) throw new Error(`recording not uploaded: ${iv.recording_bytes}`);
  if (!iv.questions[0].answer.has_audio) throw new Error("answer audio not stored");
  console.log(`  recording: ${iv.recording_bytes} bytes; overall ${iv.report.scores.overall}%`);
  step("session video + answer audio uploaded and linked to the interview");
  await page.locator("details").first().click();
  await page.getByText("A stronger answer").first().waitFor();
  await page.locator(".recharts-bar-rectangle").first().waitFor();
  await shot("07-report");

  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download PDF" }).click()]);
  const pdfPath = path.join(SHOTS, "report.pdf");
  await download.saveAs(pdfPath);
  const { readFileSync } = await import("node:fs");
  if (!readFileSync(pdfPath).subarray(0, 4).equals(Buffer.from("%PDF"))) throw new Error("not a PDF");
  step("PDF report downloaded");

  const videoOk = await page.evaluate(() => new Promise((res) => {
    const v = document.querySelector('video[src*="/recording"]');
    if (!v) return res(false);
    if (v.readyState >= 1) return res(true);
    v.addEventListener("loadedmetadata", () => res(true)); v.addEventListener("error", () => res(false)); v.load();
  }));
  if (!videoOk) throw new Error("recording does not play back");
  step("recording plays back in the report");

  await page.getByRole("button", { name: "Delete recording" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await page.getByText(/video recording and answer audio were deleted/).waitFor();
  step("recording deleted, report kept");

  await page.goto(`${BASE}/history`);
  await page.getByText("Report ready").waitFor(); await shot("08-history");
  await page.goto(`${BASE}/dashboard`);
  await page.getByText("Interviews completed").waitFor(); await shot("09-dashboard");
  await page.goto(`${BASE}/settings`);
  await page.selectOption("#theme", "dark"); await page.getByRole("button", { name: "Save settings" }).click();
  await page.getByText("Settings saved.").waitFor();
  if ((await page.evaluate(() => document.documentElement.dataset.theme)) !== "dark") throw new Error("theme not applied");
  await shot("10-settings-dark"); step("dashboard, history, settings (dark theme)");

  await page.setViewportSize({ width: 390, height: 844 });
  for (const p of [`/interviews/${interviewId}/report`, "/analysis/1", "/history"]) {
    await page.goto(BASE + p); await page.waitForTimeout(800);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 0) throw new Error(`horizontal overflow ${overflow}px at 390px on ${p}`);
  }
  await shot("11-mobile-dark-history"); step("no horizontal overflow at phone width");

  if (errors.length) throw new Error("browser errors:\n" + errors.join("\n"));
  console.log("\nAll end-to-end checks passed. Screenshots:", SHOTS);
} catch (e) {
  console.error("\nE2E FAILED:", e.message);
  if (errors.length) console.error(errors.join("\n"));
  console.error("--- server log tail ---\n" + serverLog.split("\n").slice(-25).join("\n"));
  process.exitCode = 1;
} finally {
  await browser?.close();
  server.kill();
}
