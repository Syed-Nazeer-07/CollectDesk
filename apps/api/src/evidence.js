/**
 * Private, small PDF evidence for the synthetic demonstration only.
 *
 * Uses MongoDB GridFS to keep blobs out of the public static directory. This
 * deliberately defaults OFF until SAMPLE_EVIDENCE_ENABLED=true is configured.
 * There is NO malware scanning or data-retention service in this preview;
 * uploading actual financial/customer documents is prohibited.
 */
import express from 'express';
import mongoose from 'mongoose';
import {Readable} from 'node:stream';
import {randomUUID} from 'node:crypto';
import {Case} from './models.js';
import {pipeline} from 'node:stream/promises';
import {rateLimit} from 'express-rate-limit';
import {requireRole} from './auth.js';

const MAX_BYTES=1024*1024; // 1 MiB/file
const MAX_FILES=3;
const bucketName='sampleEvidence';
const uploadLimiter=rateLimit({
  windowMs:60*60*1000,limit:12,standardHeaders:'draft-8',legacyHeaders:false,
  message:{error:'Too many sample uploads. Please retry later.'}
});
const enabled=()=>process.env.SAMPLE_EVIDENCE_ENABLED==='true';
// Serialize document changes using the existing short-lived case lease.
// This also prevents submission while an upload is being written.
async function withEvidenceLease(req,res,operation){
  const token=randomUUID();
  const acquired=await Case.updateOne({
    _id:req.caseItem._id,
    status:{$in:['draft','needs_info']},
    $or:[{financialLockToken:null},{financialLockExpiresAt:{$lt:new Date()}}]
  },{$set:{financialLockToken:token,financialLockExpiresAt:new Date(Date.now()+120_000)}});
  if(!acquired.modifiedCount)return res.status(409).json({
    error:'This case is being updated or is no longer editable. Refresh and retry.'
  });
  try{return await operation();}
  finally{
    try{
      await Case.updateOne({_id:req.caseItem._id,financialLockToken:token},
        {$set:{financialLockToken:null,financialLockExpiresAt:null}});
    }catch(error){console.error('[Evidence] Lease cleanup failed:',error?.message);}
  }
}
function bucket(){return new mongoose.mongo.GridFSBucket(mongoose.connection.db,{bucketName});}
function validId(id){return mongoose.isValidObjectId(id);}
function fileScope(item){return {'metadata.caseId':item._id,'metadata.organizationId':item.organizationId};}
function fileMeta(file){return {
  id:String(file._id),name:file.metadata?.originalName||'sample-evidence.pdf',
  size:file.length,createdAt:file.uploadDate
};}
function safeFileName(header){
  let name=typeof header==='string'?header:'sample-evidence.pdf';
  try{name=decodeURIComponent(name);}catch{}
  name=name.split(/[\/\\]/).pop()||'sample-evidence.pdf';
  name=name.replace(/[^A-Za-z0-9_. -]/g,'').slice(0,90).trim();
  return name.toLowerCase().endsWith('.pdf')?name:'sample-evidence.pdf';
}
function looksLikePdf(buf) {
  return Buffer.isBuffer(buf) && buf.length>=16 && buf.length<=MAX_BYTES &&
    buf.subarray(0,5).toString('ascii')==='%PDF-' &&
    buf.subarray(Math.max(0,buf.length-1024)).includes(Buffer.from('%%EOF'));
}
export function installEvidenceRoutes(route,{getCase,logEvent}) {
  route.get('/cases/:id/evidence',getCase,async(req,res)=>{
    res.set('Cache-Control','no-store');
    if(!enabled())return res.json({enabled:false,files:[],maxFiles:MAX_FILES,maxBytes:MAX_BYTES});
    const files=await bucket().find(fileScope(req.caseItem))
      .sort({uploadDate:-1}).limit(MAX_FILES+2).toArray();
    return res.json({enabled:true,files:files.map(fileMeta),maxFiles:MAX_FILES,maxBytes:MAX_BYTES});
  });
  route.post('/cases/:id/evidence',getCase,requireRole('creditor'),uploadLimiter,
    express.raw({type:'application/pdf',limit:MAX_BYTES}),async(req,res)=>{
      if(!enabled())return res.status(503).json({error:'Sample evidence uploads are disabled.'});
      if(!['draft','needs_info'].includes(req.caseItem.status))
        return res.status(409).json({error:'Evidence may only be added while the case is editable.'});
      if(!looksLikePdf(req.body))
        return res.status(422).json({error:'Provide a valid sample PDF (1 MB maximum).'});
      return withEvidenceLease(req,res,async()=>{
      const store=bucket();
      const count=await store.find(fileScope(req.caseItem)).toArray();
      if(count.length>=MAX_FILES)
        return res.status(409).json({error:'This case already has the maximum three sample documents.'});
      const originalName=safeFileName(req.get('x-file-name'));
      const stream=store.openUploadStream('synthetic-'+req.caseItem.caseCode+'.pdf',{
        metadata:{caseId:req.caseItem._id,organizationId:req.caseItem.organizationId,
          uploadedBy:req.user._id,originalName,classification:'fictional-demo-only'}
      });
      await pipeline(Readable.from([req.body]),stream);
      await logEvent(req.caseItem,req.user,'sample_evidence_added',
        'Sample PDF evidence attached (fictional data only).');
      res.set('Cache-Control','no-store');
      res.status(201).json({id:String(stream.id),name:originalName});
      });
    }
  );
  route.get('/cases/:id/evidence/:fileId',getCase,async(req,res)=>{
    if(!enabled())return res.status(404).json({error:'Document not found.'});
    if(!validId(req.params.fileId))return res.status(404).json({error:'Document not found.'});
    const store=bucket();
    const file=await store.find({_id:new mongoose.Types.ObjectId(req.params.fileId),
      ...fileScope(req.caseItem)}).next();
    if(!file)return res.status(404).json({error:'Document not found.'});
    res.set({
      'Cache-Control':'private, no-store',
      'Content-Type':'application/octet-stream',
      'Content-Disposition':'attachment; filename="collectdesk-sample-evidence.pdf"',
      'X-Content-Type-Options':'nosniff',
      'Content-Security-Policy':"sandbox"
    });
    // Response is never inlined or exposed through a public URL.
    const source=store.openDownloadStream(file._id);
    source.on('error',err=>{
      console.error('[Evidence] Read failed:',err?.message);
      if(!res.headersSent)res.status(500).json({error:'Could not retrieve sample document.'});
      else res.destroy(err);
    });
    source.pipe(res);
  });
  route.delete('/cases/:id/evidence/:fileId',getCase,requireRole('creditor'),async(req,res)=>{
    if(!enabled())return res.status(404).json({error:'Document not found.'});
    if(!['draft','needs_info'].includes(req.caseItem.status))
      return res.status(409).json({error:'Submitted-case evidence cannot be deleted.'});
    if(!validId(req.params.fileId))return res.status(404).json({error:'Document not found.'});
    return withEvidenceLease(req,res,async()=>{
      const store=bucket();
      const file=await store.find({_id:new mongoose.Types.ObjectId(req.params.fileId),
        ...fileScope(req.caseItem)}).next();
      if(!file)return res.status(404).json({error:'Document not found.'});
      await store.delete(file._id);
      await logEvent(req.caseItem,req.user,'sample_evidence_deleted','Synthetic PDF evidence removed.');
      res.set('Cache-Control','no-store');
      return res.json({ok:true});
    });
  });
}
