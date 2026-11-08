import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign,randomBytes} from 'node:crypto';
import {verifyGoogleIdToken} from '../src/registration.js';

const now=()=>Math.floor(Date.now()/1000);
const base64=data=>Buffer.from(JSON.stringify(data)).toString('base64url');
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const jwk={...publicKey.export({format:'jwk'}),kid:'test-google-key',use:'sig',alg:'RS256'};
function makeIdToken({aud='ci-google-client',nonce='ci-nonce',email_verified=true,issuer='https://accounts.google.com',exp=now()+600}={}){
  const head=base64({alg:'RS256',kid:jwk.kid,typ:'JWT'});
  const claims=base64({
    iss:issuer,aud,nonce,sub:'google-sub-verified-1001',
    name:'Fictional Person',email:'person@example.test',email_verified,
    iat:now(),exp
  });
  const unsigned=head+'.'+claims;
  return unsigned+'.'+sign('RSA-SHA256',Buffer.from(unsigned),privateKey).toString('base64url');
}
const fakeFetch=async()=>new Response(JSON.stringify({keys:[jwk]}),{status:200,headers:{'Content-Type':'application/json'}});

test('Google ID tokens require a verified signature and expected claims',async()=>{
  const credential=makeIdToken();
  const result=await verifyGoogleIdToken(credential,'ci-nonce','ci-google-client',{fetchKeys:fakeFetch});
  assert.equal(result.sub,'google-sub-verified-1001');
  assert.equal(result.email,'person@example.test');
  await assert.rejects(verifyGoogleIdToken(credential,'wrong-nonce','ci-google-client',{fetchKeys:fakeFetch}));
  await assert.rejects(verifyGoogleIdToken(credential,'ci-nonce','wrong-audience',{fetchKeys:fakeFetch}));
  await assert.rejects(verifyGoogleIdToken(makeIdToken({email_verified:false}),'ci-nonce','ci-google-client',{fetchKeys:fakeFetch}));
  await assert.rejects(verifyGoogleIdToken(makeIdToken({exp:now()-3}),'ci-nonce','ci-google-client',{fetchKeys:fakeFetch}));
  await assert.rejects(verifyGoogleIdToken(makeIdToken({issuer:'https://attacker.example'}),'ci-nonce','ci-google-client',{fetchKeys:fakeFetch}));
  const parts=credential.split('.');
  const modified=parts[0]+'.'+base64({...JSON.parse(Buffer.from(parts[1],'base64url').toString()),email:'staff@example.test'})+'.'+parts[2];
  await assert.rejects(verifyGoogleIdToken(modified,'ci-nonce','ci-google-client',{fetchKeys:fakeFetch}));
  await assert.rejects(verifyGoogleIdToken(credential,'ci-nonce','ci-google-client',{fetchKeys:async()=>new Response(JSON.stringify({keys:[]}),{status:200})}));
});
