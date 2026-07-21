import { MongoMemoryServer } from 'mongodb-memory-server';
import { connectDb, disconnectDb } from '../../src/db.js';
import mongoose from 'mongoose';

let mongod: MongoMemoryServer | null = null;

/** Spin up an in-memory MongoDB and connect mongoose to it. */
export async function startMemoryDb(): Promise<void> {
  mongod = await MongoMemoryServer.create();
  await connectDb({ uri: mongod.getUri(), retries: 1 });
}

export async function stopMemoryDb(): Promise<void> {
  await disconnectDb();
  if (mongod) {
    await mongod.stop();
    mongod = null;
  }
}

export async function clearCollections(): Promise<void> {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
}
