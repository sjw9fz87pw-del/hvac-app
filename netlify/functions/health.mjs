export default async (req, context) => {
  return Response.json({
    status: "ok",
    context: context.deploy?.context ?? "unknown",
    deployId: context.deploy?.id ?? "unknown",
    site: context.site?.name ?? "unknown",
    time: new Date().toISOString(),
  }, {
    headers: { "cache-control": "no-store" },
  });
};

export const config = {
  path: "/api/health",
};
