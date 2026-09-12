import type { Config } from "@netlify/functions";

/**
 * Wakes the nightly maintenance job.
 *
 * The work itself lives in the Next.js route so there is one runtime, one set of
 * module resolution rules, and one place where the maintenance engine is called
 * from. This function's only job is to be the clock.
 */
export default async function handler(): Promise<Response> {
  const baseUrl = process.env.APP_BASE_URL ?? process.env.URL;
  const token = process.env.JOB_TOKEN;

  if (!baseUrl || !token) {
    console.error("scheduled-refresh: APP_BASE_URL and JOB_TOKEN must both be set");
    return new Response("Not configured", { status: 500 });
  }

  const response = await fetch(`${baseUrl}/api/v1/jobs/refresh`, {
    method: "POST",
    headers: { "x-job-token": token },
  });

  const body = await response.text();
  console.log(`scheduled-refresh: ${response.status} ${body}`);
  return new Response(body, { status: response.status });
}

/** 07:00 UTC — early morning in US Eastern, before the first visits of the day. */
export const config: Config = {
  schedule: "0 7 * * *",
};
