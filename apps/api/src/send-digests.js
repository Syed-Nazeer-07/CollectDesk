import 'dotenv/config';
import mongoose from 'mongoose';
import {sendWorkspaceDigests} from './workspace-digest.js';

try{
  const origin=process.env.WEB_ORIGIN || process.env.RENDER_EXTERNAL_URL;
  if(!process.env.MONGODB_URI || !origin)throw new Error('MongoDB and web origin are required.');
  await mongoose.connect(process.env.MONGODB_URI,{serverSelectionTimeoutMS:9000});
  const result=await sendWorkspaceDigests({origin});
  console.info('CollectDesk digest batch completed',result);
  if(result.unconfirmed)process.exitCode=1;
}catch(error){
  console.error('CollectDesk digest batch failed',{name:error.name,code:error.code});
  process.exitCode=1;
}finally{
  await mongoose.disconnect();
}
