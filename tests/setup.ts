// Test-only defaults so unit tests run without a .env present.
process.env.NFC_TAG_SECRET ??= "test-secret-at-least-thirty-two-characters-long";
process.env.APP_BASE_URL ??= "http://localhost:3000";
process.env.DATABASE_URL ??= "postgresql://pmops:pmops@localhost:5432/pmops?schema=public";
