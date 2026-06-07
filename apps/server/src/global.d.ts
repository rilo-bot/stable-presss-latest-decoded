import * as mongodb from 'mongodb';

declare global {
  type Db = mongodb.Db;
  type MongoClient = mongodb.MongoClient;
  type ObjectId = mongodb.ObjectId;

  var Db: typeof mongodb.Db;
  var MongoClient: typeof mongodb.MongoClient;
  var ObjectId: typeof mongodb.ObjectId;
}