/**
 * Where the database connection string comes from.
 *
 * On Netlify the database is provisioned automatically and the connection string
 * is resolved at runtime — including per-branch databases for deploy previews, so
 * a preview never touches production data. Locally it comes from `DATABASE_URL`.
 *
 * `@netlify/database` is imported lazily and defensively: it throws outside a
 * Netlify environment, and a failure to resolve must fall back rather than take
 * the process down.
 */
export function resolveDatabaseUrl(): string | undefined {
  // An explicit DATABASE_URL always wins, so local development and tests are
  // never surprised by an ambient platform connection.
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  // Netlify DB exposes these directly during build and at runtime.
  if (process.env.NETLIFY_DATABASE_URL) return process.env.NETLIFY_DATABASE_URL;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getConnectionString } = require("@netlify/database") as {
      getConnectionString: () => string;
    };
    return getConnectionString();
  } catch {
    return undefined;
  }
}
