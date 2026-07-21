/**
 * One-time migration: copy every collection from the legacy `automatorr`
 * database into `speccify` on the same MongoDB server, preserving `_id`s.
 *
 * - The source db is left intact as a backup (drop it manually once verified).
 * - Idempotent: uses replaceOne upserts, so re-running is safe.
 * - Uses mongoose's `useDb` so no extra driver dependency is needed.
 *
 * Usage:
 *   npm run db:migrate-speccify --workspace server
 *   npm run db:migrate-speccify --workspace server -- mongodb://host:27017
 */
import mongoose from 'mongoose';

const BASE = (process.argv[2] ?? process.env.MONGO_BASE_URI ?? 'mongodb://127.0.0.1:27017').replace(
  /\/+$/,
  '',
);
const SOURCE = 'automatorr';
const TARGET = 'speccify';

async function main(): Promise<void> {
  await mongoose.connect(`${BASE}/${SOURCE}`, { serverSelectionTimeoutMS: 5000 });
  const srcDb = mongoose.connection.db;
  const dstDb = mongoose.connection.useDb(TARGET, { useCache: true }).db;
  if (!srcDb || !dstDb) throw new Error('Could not obtain database handles');

  const cols = (await srcDb.listCollections().toArray()).filter(
    (c) => !c.name.startsWith('system.'),
  );
  if (cols.length === 0) {
    console.log(`Source db "${SOURCE}" has no collections — nothing to migrate.`);
    await mongoose.disconnect();
    return;
  }

  console.log(`Migrating ${cols.length} collections: ${SOURCE} → ${TARGET} (on ${BASE})\n`);
  let totalDocs = 0;
  for (const { name } of cols) {
    const docs = await srcDb.collection(name).find({}).toArray();
    if (docs.length === 0) {
      console.log(`  ${name.padEnd(20)} 0 docs (skipped)`);
      continue;
    }
    const ops = docs.map((d) => ({
      replaceOne: { filter: { _id: d._id }, replacement: d, upsert: true },
    }));
    const res = await dstDb.collection(name).bulkWrite(ops, { ordered: false });
    const written = (res.upsertedCount ?? 0) + (res.modifiedCount ?? 0) + (res.insertedCount ?? 0);
    totalDocs += docs.length;
    console.log(`  ${name.padEnd(20)} ${String(docs.length).padStart(6)} docs → written ${written}`);
  }

  console.log(
    `\nDone (${totalDocs} docs). "${SOURCE}" left intact as a backup — drop it manually once "${TARGET}" is verified.`,
  );
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exitCode = 1;
});
