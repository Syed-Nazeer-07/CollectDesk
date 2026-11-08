import 'dotenv/config';
import mongoose from 'mongoose';
import app from './app.js';
if(!process.env.JWT_SECRET || process.env.JWT_SECRET.length<32){console.error('JWT_SECRET must be at least 32 characters.');process.exit(1);}
if(process.env.NODE_ENV==='production' && process.env.JWT_SECRET.includes('replace-with')){console.error('Refusing insecure production secret.');process.exit(1);}
if(!process.env.MONGODB_URI){console.error('MONGODB_URI is required.');process.exit(1);}
try{
  await mongoose.connect(process.env.MONGODB_URI,{serverSelectionTimeoutMS:9000});
  // Hosted single-container mode binds the API to loopback only, so Render
  // detects exactly one public HTTP listener (Next.js on PORT).
  // Local Docker Compose leaves API_LISTEN_HOST unset and still binds externally.
  const host=process.env.API_LISTEN_HOST||'0.0.0.0';
  const server=app.listen(Number(process.env.PORT||4000),host,()=>console.log(`CollectDesk API listening on ${host}:${process.env.PORT||4000}`));
  process.on('SIGTERM',()=>server.close(async()=>{await mongoose.disconnect();process.exit(0);}));
} catch(e){console.error('MongoDB unavailable:',e.message);process.exit(1);}
