import { MongoClient, type Db } from 'mongodb';
import { MONGODB_URI, MONGODB_DB } from '../config.js';

let client: MongoClient | undefined;

export async function getDb(): Promise<Db> {
  if (!client) {
    if (!MONGODB_URI) {
      throw new Error('[database] MONGODB_URI is not set in .env');
    }
    client = new MongoClient(MONGODB_URI);
    await client.connect(); // one connection, reused by every call
  }
  return client.db(MONGODB_DB);
}
