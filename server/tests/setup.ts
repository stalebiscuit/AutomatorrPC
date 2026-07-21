/* Vitest global setup — provide deterministic env before config loads. */
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI ??= 'mongodb://127.0.0.1:27017/speccify-test';
// Admin auth uses ephemeral RS256 keys + the console mailer under NODE_ENV=test.
process.env.SUPERADMIN_EMAILS ??= 'daniel.hardman@automatorr.com,abishai.bajaj@automatorr.com';
process.env.CLIENT_ORIGIN ??= 'http://localhost:5173';
