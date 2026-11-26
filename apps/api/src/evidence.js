/**
 * Private fictional PDFs only (feature defaults OFF). New files are ordinary
 * bounded BSON documents, allowing file and audit mutation in one transaction.
 * Historical GridFS files remain readable and deletable through a legacy path.
 * No malware scanning or real-document retention service is provided.
 */
import express from 'express';
import mongoose from 'mongoose';
import {randomUUID} from 'node:crypto';
import {Case,SampleDocument} from './models.js';
import {rateLimit} from 'express-rate-limit';
import {requireRole} from './auth.js';
import {withCaseTransaction,transactionResponse} from './ledger.js';
import {scopeForUser} from './rules.js';

const MAX_BYTES=1024*1024,MAX_FILES=3;
const bucketName='sampleEvidence';
const enabled=()=>process.env.SAMPLE_EVIDENCE_ENABLED==='true';
const editable=item=>['draft','needs_info'].includes(item.status);
const uploadLimiter=rateLimit({windowMs:60*60*1000,limit:12,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'Too many sample uploads. Please retry later.'}});
function bucket(){return new mongoose.mongo.GridFSBucket(mongoose.connection.db,{bucketName});}
function fileScope(item){return {'metadata.caseId':item._id,'metadata.organizationId':item.organizationId};}
function docScope(item){return {caseId:item._id,organizationId:item.organizationId};}
function fileMeta(file){return {id:String(file._id),name:file.metadata?.originalName||'sample-evidence.pdf',size:file.length,createdAt:file.uploadDate};}
function docMeta(file){return {id:String(file._id),name:file.name,size:file.size,createdAt:file.createdAt};}
function safeFileName(header){
  let name=typeof header==='string'?header:'sample-evidence.pdf';
  try{name=decodeURIComponent(name);}catch{}
  name=name.split(/[\/\\]/).pop()||'sample-evidence.pdf';
  name=name.replace(/[^A-Za-z0-9_. -]/g,'').slice(0,90).trim();
  return name.toLowerCase().endsWith('.pdf')?name:'sample-evidence.pdf';
}
function looksLikePdf(buf){return Buffer.isBuffer(buf)&&buf.length>=16&&buf.length<=MAX_BYTES&&buf.subarray(0,5).toString('ascii')==='%PDF-'&&buf.subarray(Math.max(0,buf.length-1024)).includes(Buffer.from('%%EOF'));}
function downloadHeaders(res){res.set({'Cache-Control':'private, no-store','Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename="collectdesk-sample-evidence.pdf"','X-Content-Type-Options':'nosniff','Content-Security-Policy':'sandbox'});}
async function withLegacyLease(req,res,operation){
  const token=randomUUID();
  const acquired=await Case.updateOne({_id:req.caseItem._id,...scopeForUser(req.user),status:{$in:['draft','needs_info']},$or:[{financialLockToken:null},{financialLockExpiresAt:{$lt:new Date()}}]},{$set:{financialLockToken:token,financialLockExpiresAt:new Date(Date.now()+120000)}});
  if(!acquired.modifiedCount)return res.status(409).json({error:'Case changed or is being updated. Refresh and retry.'});
  try{return await operation();}
  finally{try{await Case.updateOne({_id:req.caseItem._id,financialLockToken:token},{$set:{financialLockToken:null,financialLockExpiresAt:null}});}catch{console.error('[Evidence] Legacy lease cleanup failed');}}
}
export function installEvidenceRoutes(route,{getCase,logEvent}){
  route.get('/cases/:id/evidence',getCase,async(req,res)=>{
    if(!enabled())return res.json({enabled:false,files:[],maxFiles:MAX_FILES,maxBytes:MAX_BYTES});
    const [docs,legacy]=await Promise.all([
      SampleDocument.find(docScope(req.caseItem)).sort({createdAt:-1}).limit(MAX_FILES+2).lean(),
      bucket().find(fileScope(req.caseItem)).sort({uploadDate:-1}).limit(MAX_FILES+2).toArray()
    ]);
    const files=[...docs.map(docMeta),...legacy.map(fileMeta)].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
    res.json({enabled:true,files,maxFiles:MAX_FILES,maxBytes:MAX_BYTES});
  });
  route.post('/cases/:id/evidence',getCase,requireRole('creditor'),uploadLimiter,express.raw({type:'application/pdf',limit:MAX_BYTES}),async(req,res)=>{
    if(!enabled())return res.status(503).json({error:'Sample evidence uploads are disabled.'});
    if(!looksLikePdf(req.body))return res.status(422).json({error:'Provide a valid sample PDF (1 MB maximum).'});
    return withCaseTransaction(req,res,async session=>{
      const item=req.caseItem;
      if(!editable(item))return transactionResponse(409,{error:'Evidence may only be added while the case is editable.'});
      // The transaction holds the same case write lock as legacy deletion.
      const count=await SampleDocument.countDocuments(docScope(item)).session(session);
      const legacyCount=await mongoose.connection.db.collection(bucketName+'.files').countDocuments(fileScope(item),{session});
      if(count+legacyCount>=MAX_FILES)return transactionResponse(409,{error:'This case already has the maximum three sample documents.'});
      const name=safeFileName(req.get('x-file-name'));
      const [file]=await SampleDocument.create([{...docScope(item),uploadedBy:req.user._id,name,size:req.body.length,content:req.body}],{session});
      await logEvent(item,req.user,'sample_evidence_added','Sample PDF evidence attached (fictional data only).','creditor',{fileId:String(file._id)},session);
      return transactionResponse(201,{id:String(file._id),name});
    });
  });
  route.get('/cases/:id/evidence/:fileId',getCase,async(req,res)=>{
    if(!enabled()||!mongoose.isValidObjectId(req.params.fileId))return res.status(404).json({error:'Document not found.'});
    const id=new mongoose.Types.ObjectId(req.params.fileId);
    const doc=await SampleDocument.findOne({_id:id,...docScope(req.caseItem)}).select('+content');
    if(doc){downloadHeaders(res);return res.send(Buffer.from(doc.content));}
    const store=bucket(),legacy=await store.find({_id:id,...fileScope(req.caseItem)}).next();
    if(!legacy)return res.status(404).json({error:'Document not found.'});
    downloadHeaders(res);
    const source=store.openDownloadStream(legacy._id);
    source.on('error',err=>{console.error('[Evidence] Legacy read failed');if(!res.headersSent)res.status(500).json({error:'Could not retrieve sample document.'});else res.destroy(err);});
    source.pipe(res);
  });
  route.delete('/cases/:id/evidence/:fileId',getCase,requireRole('creditor'),async(req,res)=>{
    if(!enabled()||!mongoose.isValidObjectId(req.params.fileId))return res.status(404).json({error:'Document not found.'});
    const id=new mongoose.Types.ObjectId(req.params.fileId);
    if(!editable(req.caseItem))return res.status(409).json({error:'Submitted-case evidence cannot be deleted.'});
    if(await SampleDocument.exists({_id:id,...docScope(req.caseItem)}))return withCaseTransaction(req,res,async session=>{
      const item=req.caseItem;
      if(!editable(item))return transactionResponse(409,{error:'Submitted-case evidence cannot be deleted.'});
      const deleted=await SampleDocument.deleteOne({_id:id,...docScope(item)},{session});
      if(!deleted.deletedCount)return transactionResponse(404,{error:'Document not found.'});
      await logEvent(item,req.user,'sample_evidence_deleted','Synthetic PDF evidence removed.','creditor',{fileId:String(id)},session);
      return transactionResponse(200,{ok:true});
    });
    // Historical GridFS records use the original serialized deletion path.
    // GridFS itself does not support transactions; no automatic migration.
    return withLegacyLease(req,res,async()=>{
      const store=bucket(),file=await store.find({_id:id,...fileScope(req.caseItem)}).next();
      if(!file)return res.status(404).json({error:'Document not found.'});
      await store.delete(file._id);
      await logEvent(req.caseItem,req.user,'sample_evidence_deleted','Legacy synthetic PDF evidence removed.','creditor',{fileId:String(id)});
      return res.json({ok:true});
    });
  });
}
