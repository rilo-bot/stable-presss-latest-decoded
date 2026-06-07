import { Db as MongoDb, MongoClient as MongoMongoClient, ObjectId as MongoObjectId } from 'mongodb';

declare global {
  type Db = MongoDb;
  type MongoClient = MongoMongoClient;
  type ObjectId = MongoObjectId;

  var MongoClient: typeof MongoMongoClient;
  var ObjectId: typeof MongoObjectId;
}