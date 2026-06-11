// REMOVED: import { MongoClient as RealMongoClient, ObjectId as RealObjectId, Db as RealDb } from 'mongodb'; — no database in WebContainers
declare global {
  type Db = RealDb;
  type MongoClient = RealMongoClient;
  type ObjectId = RealObjectId;

  var MongoClient: typeof RealMongoClient;
  var ObjectId: typeof RealObjectId;
}