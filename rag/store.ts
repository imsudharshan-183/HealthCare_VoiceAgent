import { MongoClient, type Db } from 'mongodb';

let client: MongoClient | undefined;

export async function getDb(): Promise<Db> {
  if (!client) {
    client = new MongoClient(process.env.MONGODB_URI!);
    await client.connect(); // one connection, reused by every call
  }
  return client.db(process.env.MONGODB_DB ?? 'hcva');
}