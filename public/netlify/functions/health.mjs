export default async () => {
  return Response.json({
    status: "ok",
    context: process.env.CONTEXT ?? "unknown",
    branch: process.env.BRANCH ?? "unknown",
    commit: (process.env.COMMIT_REF ?? "unknown").slice(0, 7),
    time: new Date().toISOString(),
  }, {
    headers: { "cache-control": "no-store" },
  });
};

export const config = {
  path: "/api/health",
};
