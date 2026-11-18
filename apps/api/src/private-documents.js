import express from 'express';
import net from 'node:net';
import {randomUUID} from 'node:crypto';
import {pipeline} from 'node:stream/promises';
import {S3Client,PutObjectCommand,GetObjectCommand,DeleteObjectCommand} from '@aws-sdk/client-s3';
import {rateLimit} from 'express-rate-limit';
import {z} from 'zod';
import mongoose from 'mongoose';
import {Case,CaseDocument,DocumentEvent} from './models.js';
import {requireRole} from './auth.js';
import {canEditDraft,scopeForUser} from './rules.js';

export const MAX_DOCUMENT_BYTES=5*1024*1024;
const MAX_DOCUMENTS=5;
const categorySchema=z.enum(['invoice','contract','correspondence','other']);
const uploads=rateLimit({windowMs:60*60*1000,limit:20,standardHeaders:'draft-8',legacyHeaders:false,
  message:{error:'Document limit reached. Try again later.'}});

let storage;
export function documentConfig(env=process.env) {
  if(env.PRIVATE_DOCUMENTS_ENABLED!=='true')return null;
  const retentionDays=Number(env.DOCUMENT_RETENTION_DAYS);
  const port=Number(env.CLAMAV_PORT||3310);
  const bucket=env.DOCUMENT_BUCKET;
  if(!bucket || !env.DOCUMENT_REGION || !env.CLAMAV_HOST || !Number.isInteger(port) || port<1 || port>65535 ||
    !Number.isInteger(retentionDays) || retentionDays<1 || retentionDays>3650){
    throw new Error('Private document storage, scanner and retention configuration are required.');
  }
  return {bucket,region:env.DOCUMENT_REGION,host:env.CLAMAV_HOST,port,retentionDays};
}

export function privateDocumentService() {
  const config=documentConfig();
  if(!config)return null;
  if(!storage)storage=new S3Client({region:config.region,maxAttempts:2});
  return {config,storage,scan:scanPdf};
}

export async function assertDocumentsReady() {
  if(!documentConfig())return;
  await Promise.all([CaseDocument.init(),DocumentEvent.init()]);
}

export function scanPdf(buffer,{host,port}) {
  return new Promise((resolve,reject)=>{
    const socket=net.createConnection({host,port});
    const timeout=setTimeout(()=>socket.destroy(new Error('Scanner timeout')),7000);
    let output='';
    socket.once('connect',()=>{
      socket.write('zINSTREAM\0');
      for(let offset=0;offset<buffer.length;offset+=64*1024) {
        const chunk=buffer.subarray(offset,offset+64*1024);
        const size=Buffer.alloc(4);
        size.writeUInt32BE(chunk.length);
        socket.write(size);
        socket.write(chunk);
      }
      socket.write(Buffer.alloc(4));
    });
    socket.on('data',chunk=>{
      output+=chunk.toString('utf8');
      if(output.length>1024) socket.destroy(new Error('Scanner returned an invalid response'));
      if(output.includes('\0'))socket.end();
    });
    socket.once('error',reject);
    socket.once('close',()=>{
      clearTimeout(timeout);
      if(output==='stream: OK\0')resolve(true);
      else if(/^stream: .+ FOUND\0$/.test(output))resolve(false);
      else reject(new Error('Scanner did not return a verdict'));
    });
  });
}

function documentName(value){
  let input='';
  try {input=decodeURIComponent(value||'');} catch { /* Use the safe default. */ }
  const name=input.split(/[\\/]/).pop()?.replace(/[^a-z0-9 ._-]/gi,'').trim().slice(0,110);
  return name?.toLowerCase().endsWith('.pdf')?name:'document.pdf';
}

function validPdf(bytes) {
  return Buffer.isBuffer(bytes) && bytes.length<=MAX_DOCUMENT_BYTES &&
    /^%PDF-[12]\.\d[\r\n]/.test(bytes.subarray(0,12).toString('ascii')) &&
    /%%EOF\s*$/.test(bytes.subarray(-1024).toString('ascii'));
}

function view(row){
  return {id:String(row._id),name:row.name,category:row.category,size:row.size,
    status:row.status,expiresAt:row.expiresAt,createdAt:row.createdAt};
}

async function reserveDocument(fields){
  for(let slot=0;slot<MAX_DOCUMENTS;slot++){
    try {return await CaseDocument.create({...fields,slot});}
    catch(error){if(error.code!==11000)throw error;}
  }
  return null;
}

export function installPrivateDocumentRoutes(route,{getCase,getService=privateDocumentService}){
  route.get('/cases/:id/documents',getCase,async(req,res)=>{
    if(!getService())return res.json({enabled:false,documents:[]});
    const {caseItem,user}=req;
    const rows=await CaseDocument.find({
      caseId:caseItem._id,organizationId:caseItem.organizationId,expiresAt:{$gt:new Date()},
      ...(!['admin','creditor'].includes(user.role)?{status:'clean'}:{})
    }).sort({createdAt:-1}).lean();
    res.json({enabled:true,documents:rows.map(view)});
  });

  route.post('/cases/:id/documents',getCase,requireRole('creditor'),uploads,
    express.raw({type:'application/pdf',limit:MAX_DOCUMENT_BYTES}),async(req,res)=>{
      const provider=getService();
      if(!provider)return res.status(503).json({error:'Private documents are unavailable.'});
      if(!canEditDraft(req.user.role,req.caseItem.status))
        return res.status(409).json({error:'Documents may be added while a case is editable.'});
      if(!validPdf(req.body))return res.status(422).json({error:'Provide a valid PDF of up to 5 MiB.'});
      const category=categorySchema.parse(req.get('X-Document-Category'));
      const {storage,config,scan}=provider;
      const keys={caseId:req.caseItem._id,organizationId:req.caseItem.organizationId};
      const row=await reserveDocument({...keys,createdBy:req.user._id,
        objectKey:'documents/'+randomUUID(),name:documentName(req.get('X-File-Name')),
        category,size:req.body.length,status:'quarantined',
        expiresAt:new Date(Date.now()+86_400_000)});
      if(!row)return res.status(409).json({error:'This case has reached its private document limit.'});
      try {
        const clean=await scan(req.body,config);
        if(!clean){
          await CaseDocument.updateOne({_id:row._id},{$set:{status:'rejected'}});
          return res.status(422).json({error:'This PDF did not pass security scanning.'});
        }
        // Recheck ownership and edit state after the scan. Use the same case lease
        // as submission and existing evidence to serialize publication.
        const token=randomUUID();
        const lock=await Case.updateOne({_id:keys.caseId,organizationId:keys.organizationId,
          status:{$in:['draft','needs_info']},financialLockToken:null},
        {$set:{financialLockToken:token,financialLockExpiresAt:new Date(Date.now()+120_000)}});
        if (!lock.modifiedCount)
          return res.status(409).json({error:'Case changed while scanning. Retry if the case is editable.'});
        try {
          await storage.send(new PutObjectCommand({Bucket:config.bucket,Key:row.objectKey,Body:req.body,
            ContentType:'application/pdf',ServerSideEncryption:'AES256'}),{abortSignal:AbortSignal.timeout(12000)});
          row.status='clean';
          row.expiresAt=new Date(Date.now()+config.retentionDays*86_400_000);
          await row.save();
          res.status(201).json({document:view(row)});
        } finally {
          await Case.updateOne({_id:keys.caseId,financialLockToken:token},
            {$set:{financialLockToken:null,financialLockExpiresAt:null}}).catch(error=>{
            console.error('[Documents] Could not release case lease',{name:error.name});
          });
        }
      } catch (error) {
        console.error('[Documents] Upload incomplete',{name:error.name});
        return res.status(503).json({error:'The document could not be made available. Try again later.'});
      }
    });

  route.get('/cases/:id/documents/:documentId',getCase,async(req,res)=>{
    const provider=getService();
    if(!provider||!mongoose.isObjectIdOrHexString(req.params.documentId))
      return res.status(404).json({error:'Document not found.'});
    const row=await CaseDocument.findOne({_id:req.params.documentId,caseId:req.caseItem._id,
      organizationId:req.caseItem.organizationId,status:'clean',expiresAt:{$gt:new Date()}})
      .select('+objectKey').lean();
    if(!row)return res.status(404).json({error:'Document not found.'});

    const {storage,config}=provider;
    const abortSignal=AbortSignal.timeout(15000);
    let object;
    try {
      object=await storage.send(new GetObjectCommand({Bucket:config.bucket,Key:row.objectKey}),{abortSignal});
      if(!object.Body || object.ContentLength!==row.size)
        throw new Error('Object size does not match document metadata');
      const visible=await Case.exists({_id:req.caseItem._id,...scopeForUser(req.user)});
      if(!visible){
        object.Body.destroy();
        return res.status(404).json({error:'Document not found.'});
      }
      // Persist authorization to download before exposing any file bytes.
      await DocumentEvent.create({caseId:row.caseId,organizationId:row.organizationId,
        documentId:row._id,actorId:req.user._id,kind:'download_authorized'});
    } catch (error) {
      object?.Body?.destroy();
      console.error('[Documents] Download unavailable',{name:error.name});
      return res.status(503).json({error:'Document temporarily unavailable.'});
    }

    res.set({'Content-Type':'application/pdf','Content-Length':String(row.size),
      'Content-Disposition':'attachment; filename="collectdesk-document.pdf"',
      'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});
    await pipeline(object.Body,res,{signal:abortSignal}).catch(error=>{
      console.error('[Documents] Download stream interrupted',{name:error.name});
    });
  });
}

export async function purgeExpiredDocuments(provider=privateDocumentService()) {
  if(!provider)throw new Error('Configure the private document service first.');
  const {storage,config}=provider;
  const rows=await CaseDocument.find({expiresAt:{$lte:new Date()}}).sort({expiresAt:1}).limit(100)
    .select('+objectKey').lean();
  for(const row of rows){
    // Delete is idempotent. A failed object deletion leaves metadata available
    // for the next retry instead of leaving a blob with no database record.
    await storage.send(new DeleteObjectCommand({Bucket:config.bucket,Key:row.objectKey}),
      {abortSignal:AbortSignal.timeout(10000)});
    await CaseDocument.deleteOne({_id:row._id});
  }
  return rows.length;
}
