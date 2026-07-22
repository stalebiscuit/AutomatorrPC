import mongoose from 'mongoose';

/**
 * Mongo helpers for E2E setup/teardown, with a hard safety guard so the wipe
 * can NEVER run against something that looks like a real environment.
 */

export const E2E_MONGO_URI =
  process.env.E2E_MONGO_URI ?? 'mongodb://127.0.0.1:27017/speccify_e2e';

/** Parse the database name and host out of a mongodb connection string. */
function parseUri(uri: string): { dbName: string; host: string } {
  // mongodb://[user:pass@]host[:port]/dbName[?opts]
  const withoutScheme = uri.replace(/^mongodb(\+srv)?:\/\//, '');
  const afterAuth = withoutScheme.includes('@') ? withoutScheme.split('@').slice(1).join('@') : withoutScheme;
  const host = afterAuth.split('/')[0]?.split(':')[0] ?? '';
  const dbName = (afterAuth.split('/')[1] ?? '').split('?')[0] ?? '';
  return { dbName, host };
}

/**
 * Throw unless the target clearly looks like a throwaway dev/test/e2e database
 * on a local/containerised host. This is the last line of defence against a
 * misconfigured E2E_MONGO_URI pointing at speccify_test/speccify_prod.
 */
export function assertWipeSafe(uri: string): void {
  const { dbName, host } = parseUri(uri);
  const nameLooksDisposable = /(^|[_-])(e2e|test|dev|ci)([_-]|$)/i.test(dbName) || /e2e/i.test(dbName);
  const hostIsLocal = ['localhost', '127.0.0.1', '::1', 'mongo', 'mongodb'].includes(host);
  // Explicitly reject anything that smells like a persistent environment.
  const looksReal = /(prod|production|_test$|speccify_test|speccify_prod)/i.test(dbName) && !/e2e/i.test(dbName);
  if (!dbName) throw new Error(`[e2e/db] Refusing to wipe: no database name in URI (${host}).`);
  if (looksReal || !nameLooksDisposable || !hostIsLocal) {
    throw new Error(
      `[e2e/db] REFUSING to wipe database "${dbName}" on host "${host}". ` +
        `The wipe only runs against a disposable *e2e*/*ci* database on a local/containerised host. ` +
        `Check E2E_MONGO_URI.`,
    );
  }
}

export async function connect(uri: string = E2E_MONGO_URI): Promise<typeof mongoose> {
  if (mongoose.connection.readyState === 1) return mongoose;
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
  return mongoose;
}

export async function disconnect(): Promise<void> {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
}

/**
 * Wipe every collection EXCEPT the one preserved real account (a super-admin),
 * so test data never accumulates but you never lose your login. Guarded by
 * assertWipeSafe(). The preserved email is matched case-insensitively.
 */
export async function wipeExceptPreserved(preservedEmail: string): Promise<void> {
  assertWipeSafe(E2E_MONGO_URI);
  const db = mongoose.connection.db;
  if (!db) throw new Error('[e2e/db] Not connected.');
  const collections = await db.collections();
  for (const col of collections) {
    if (col.collectionName === 'adminusers') {
      // Keep exactly the preserved super-admin; drop everyone else.
      await col.deleteMany({
        email: { $not: { $regex: `^${escapeRegex(preservedEmail)}$`, $options: 'i' } },
      });
    } else {
      await col.deleteMany({});
    }
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
