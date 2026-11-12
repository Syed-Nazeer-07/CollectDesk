import mongoose from 'mongoose';

const options = {timestamps: true, versionKey: false};
const id = {type: mongoose.Schema.Types.ObjectId};
export const Organization = mongoose.model('Organization', new mongoose.Schema({name: {type: String, required: true}, country: {type: String, default: 'IN'}, active: {type: Boolean, default: true}}, options));
export const User = mongoose.model('User', new mongoose.Schema({
  name: {type: String, required: true}, email: {type: String, required: true, lowercase: true, unique: true},
  passwordHash: {type: String, required: true, select: false}, googleSub: {type:String,unique:true,sparse:true,select:false}, role: {type: String, enum: ['creditor','operator','admin'], required: true},
  organizationId: {...id, ref: 'Organization'}, active: {type: Boolean, default: true},
  sessionVersion: {type:Number,default:0,min:0},
  notificationsSeenAt: {type:Date,default:null}
}, options));
const caseSchema = new mongoose.Schema({
  caseCode: {type: String, required: true, unique: true}, organizationId: {...id, ref: 'Organization', required: true, index: true},
  createdBy: {...id, ref:'User', required: true}, debtorName: {type: String, required: true}, invoiceNo: {type: String, required: true},
  issueDate: {type: Date, required: true}, dueDate: {type: Date, required: true}, principalPaise: {type: Number, required: true, min: 100},
  currency: {type: String, enum:['INR'], default:'INR'}, description: {type: String, default:''},
  disputed: {type:Boolean, default: false}, status: {type:String, enum:['draft','submitted','needs_info','rejected','accepted','in_progress','on_hold','closed'], default:'draft'},
  feeRateBps: {type:Number, min:1500, max:3000, default:2000}, assignedTo: {...id, ref:'User'},
  decisionReason: {type:String, default:''}, submittedAt: Date, acceptedAt: Date,
  // Demo-only lease prevents simultaneous financial mutations on the same case.
  // Production still needs multi-document transactions and audited reconciliation.
  financialLockToken: {type:String, default:null, select:false},
  financialLockExpiresAt: {type:Date, default:null, select:false},
  evidenceLabel: {type:String, default:''} // demo-only text label; NOT an uploaded file
}, options);
caseSchema.index({organizationId:1,invoiceNo:1},{unique:true});
caseSchema.index({organizationId:1,status:1,createdAt:-1});
caseSchema.index({assignedTo:1,status:1});
export const Case = mongoose.model('Case', caseSchema);
export const Activity = mongoose.model('Activity', new mongoose.Schema({
  caseId: {...id, ref:'Case', required:true, index:true}, organizationId: {...id, ref:'Organization', required:true},
  actorId: {...id, ref:'User', required:true}, kind:{type:String,required:true},
  visibility:{type:String,enum:['creditor','internal'],default:'creditor'}, text:{type:String,required:true},
  metadata:{type:mongoose.Schema.Types.Mixed,default:{}}
}, options));
const receiptSchema = new mongoose.Schema({
  caseId: {...id, ref:'Case', required:true,index:true}, organizationId:{...id, ref:'Organization', required:true},
  amountPaise:{type:Number,required:true,min:1}, kind:{type:String,enum:['receipt','reversal'],default:'receipt'},
  status:{type:String,enum:['recorded','verified','rejected'],default:'recorded'}, reference:{type:String,required:true},
  reversedFrom: {...id, ref:'Receipt'}, recordedBy:{...id, ref:'User',required:true},
  verifiedBy:{...id,ref:'User'}, verifiedAt:Date
}, options);
receiptSchema.index({caseId:1,reference:1},{unique:true});
receiptSchema.index({reversedFrom:1},{unique:true,partialFilterExpression:{reversedFrom:{$exists:true}}});
export const Receipt = mongoose.model('Receipt',receiptSchema);

// Unverified signups never become active users or organizations. One-time tokens
// are stored as hashes and expire after 30 minutes (MongoDB TTL cleanup is async).
const pendingSignupSchema=new mongoose.Schema({
  name:{type:String,required:true},email:{type:String,required:true,lowercase:true},
  organizationName:{type:String,required:true},passwordHash:{type:String,required:true},
  tokenHash:{type:String,required:true,unique:true},expiresAt:{type:Date,required:true}
},options);
pendingSignupSchema.index({expiresAt:1},{expireAfterSeconds:0});
export const PendingSignup=mongoose.model('PendingSignup',pendingSignupSchema);

// Server-side one-time Google login nonces. The signed browser cookie alone
// would otherwise permit replay within the ID token's lifetime.
const googleNonceSchema=new mongoose.Schema({nonceHash:{type:String,required:true,unique:true},expiresAt:{type:Date,required:true}},options);
googleNonceSchema.index({expiresAt:1},{expireAfterSeconds:0});
export const GoogleNonce=mongoose.model('GoogleNonce',googleNonceSchema);


// One-time password recovery tokens: only hashes are stored, never raw links.
// Expired records are removed by MongoDB TTL asynchronously and also checked on use.
const passwordResetSchema=new mongoose.Schema({
  userId:{...id,ref:'User',required:true,index:true},
  tokenHash:{type:String,required:true,unique:true},
  expiresAt:{type:Date,required:true}
},options);
passwordResetSchema.index({expiresAt:1},{expireAfterSeconds:0});
export const PasswordReset=mongoose.model('PasswordReset',passwordResetSchema);

// Support requests are deliberately separate from collection case activity:
// only their creator and administrators can view them.
const supportRequestSchema=new mongoose.Schema({
  createdBy:{...id,ref:'User',required:true,index:true},
  organizationId:{...id,ref:'Organization',default:null},
  category:{type:String,enum:['onboarding','case','account','technical','other'],required:true},
  subject:{type:String,required:true,maxlength:120},
  message:{type:String,required:true,maxlength:2000},
  status:{type:String,enum:['open','in_progress','resolved'],default:'open'},
  resolutionNote:{type:String,default:'',maxlength:2000},
  // Append-only decision trail; reopening cannot erase a previous resolution.
  history:[{status:{type:String,enum:['open','in_progress','resolved'],required:true},
    note:{type:String,default:'',maxlength:2000},by:{...id,ref:'User',required:true},at:{type:Date,required:true}}],
  handledBy:{...id,ref:'User',default:null},
  resolvedAt:{type:Date,default:null}
},options);
supportRequestSchema.index({status:1,createdAt:-1});
supportRequestSchema.index({createdBy:1,createdAt:-1});
export const SupportRequest=mongoose.model('SupportRequest',supportRequestSchema);

/** Operator-only invitations. Tokens are stored as SHA-256 hashes, never raw. */
const staffInviteSchema=new mongoose.Schema({
  email:{type:String,required:true,lowercase:true,index:true},
  role:{type:String,enum:['operator'],required:true,default:'operator'},
  invitedBy:{...id,ref:'User',required:true},
  tokenHash:{type:String,required:true,unique:true},
  expiresAt:{type:Date,required:true},
  status:{type:String,enum:['pending','consumed','revoked'],default:'pending'},
  consumedAt:{type:Date,default:null}
},options);
staffInviteSchema.index({email:1,status:1});
staffInviteSchema.index({expiresAt:1},{expireAfterSeconds:30*24*60*60});
export const StaffInvite=mongoose.model('StaffInvite',staffInviteSchema);
