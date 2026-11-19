import 'dotenv/config';
import mongoose from 'mongoose';
import {documentConfig,purgeExpiredDocuments} from './private-documents.js';

try {
  if(!process.env.MONGODB_URI || !documentConfig()) throw new Error('Configure the database and private document service.');
  await mongoose.connect(process.env.MONGODB_URI,{serverSelectionTimeoutMS:9000});
  const count=await purgeExpiredDocuments();
  console.info('Expired document batch processed',{count});
} catch (error) {
  console.error('Document retention task failed',{name:error.name,code:error.code});
  process.exitCode=1;
} finally {
  await mongoose.disconnect();
}
