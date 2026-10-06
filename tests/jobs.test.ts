/**
 * The nightly job leaves a trace, and the health check reads it.
 *
 * Without the trace, a job that has stopped running is indistinguishable from
 * one that ran and found nothing to do — schedule statuses simply stop moving,
 * and nobody finds out until a unit that should read Overdue still says Current.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const TOKEN = "test-job-token-for-the-nightly-refresh";
let since: Date;

beforeAll(() => {
  process.env.JOB_TOKEN = TOKEN;
  since = new Date();
});

afterAll(async () => {
  await prisma.auditEvent.deleteMany({ where: { action: "job.refreshed", createdAt: { gte: since } } });
  await prisma.$disconnect();
});

function refreshRequest(token: string) {
  return new NextRequest("http://localhost/api/v1/jobs/refresh", {
    method: "POST",
    headers: { "x-job-token": token },
  });
}

describe("nightly job", () => {
  it("refuses a wrong token and records nothing", async () => {
    const { POST } = await import("@/app/api/v1/jobs/refresh/route");
    const response = await POST(refreshRequest("not-the-token"));
    expect(response.status).toBe(401);
    expect(await prisma.auditEvent.count({ where: { action: "job.refreshed", createdAt: { gte: since } } })).toBe(0);
  });

  it("records each run, and the health check reports it as current", async () => {
    const { POST } = await import("@/app/api/v1/jobs/refresh/route");
    const response = await POST(refreshRequest(TOKEN));
    expect(response.status).toBe(200);

    const { GET } = await import("@/app/api/v1/health/route");
    const health = await (await GET()).json();
    expect(health.nightlyJob.current).toBe(true);
    expect(new Date(health.nightlyJob.lastRunAt).getTime()).toBeGreaterThanOrEqual(since.getTime() - 1000);

    // Unauthenticated endpoint: only when it ran, never what it did.
    expect(Object.keys(health.nightlyJob).sort()).toEqual(["current", "lastRunAt"]);
  });
});
