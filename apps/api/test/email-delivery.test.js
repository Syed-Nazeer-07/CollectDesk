import test from 'node:test';
import assert from 'node:assert/strict';
import {emailDeliveryProvider,sendVerificationEmail} from '../src/email-delivery.js';

test('verification sender is disabled until all credentials for a provider are present',()=>{
  assert.equal(emailDeliveryProvider({}),null);
  assert.equal(emailDeliveryProvider({GMAIL_SMTP_USER:'owner@gmail.com'}),null);
  assert.equal(emailDeliveryProvider({GMAIL_SMTP_APP_PASSWORD:'test'}),null);
  assert.equal(emailDeliveryProvider({RESEND_API_KEY:'key'}),null);
  assert.equal(emailDeliveryProvider({GMAIL_SMTP_USER:'owner@gmail.com',GMAIL_SMTP_APP_PASSWORD:'test'}),'gmail');
  assert.equal(emailDeliveryProvider({RESEND_API_KEY:'key',AUTH_FROM_EMAIL:'verify@example.org'}),'resend');
  assert.equal(emailDeliveryProvider({
    GMAIL_SMTP_USER:'owner@gmail.com',GMAIL_SMTP_APP_PASSWORD:'test',
    RESEND_API_KEY:'key',AUTH_FROM_EMAIL:'verify@example.org'
  }),'resend','Use Resend when both senders are configured');
});

test('Gmail delivery uses authenticated TLS and a one-time verification link',async()=>{
  let transportOptions,mail,closed=false;
  await sendVerificationEmail('newuser@gmail.com','https://example.org/signup/verify?token=demo',{
    env:{GMAIL_SMTP_USER:'sender@gmail.com',GMAIL_SMTP_APP_PASSWORD:'abcd efgh ijkl mnop'},
    createTransport(options){
      transportOptions=options;
      return {
        async sendMail(message){mail=message;return {rejected:[]};},
        close(){closed=true;}
      };
    }
  });
  assert.equal(transportOptions.host,'smtp.gmail.com');
  assert.equal(transportOptions.port,465);
  assert.equal(transportOptions.secure,true);
  assert.deepEqual(transportOptions.auth,{user:'sender@gmail.com',pass:'abcdefghijklmnop'});
  assert.equal(mail.from.address,'sender@gmail.com');
  assert.equal(mail.to,'newuser@gmail.com');
  assert.match(mail.text,/signup\/verify\?token=demo/);
  assert.match(mail.text,/30 minutes/);
  assert.equal(closed,true);
});

test('Gmail rejection fails closed and closes the transport',async()=>{
  let closed=false;
  await assert.rejects(()=>sendVerificationEmail('newuser@gmail.com','https://example.org/verify',{
    env:{GMAIL_SMTP_USER:'sender@gmail.com',GMAIL_SMTP_APP_PASSWORD:'app-password'},
    createTransport:()=>({
      sendMail:async()=>({rejected:['newuser@gmail.com']}),
      close:()=>{closed=true;}
    })
  }),/rejected/);
  assert.equal(closed,true);
});

test('Resend delivery remains supported without Gmail configuration',async()=>{
  let payload;
  await sendVerificationEmail('newuser@example.org','https://example.org/signup/verify?token=demo',{
    env:{RESEND_API_KEY:'test-only',AUTH_FROM_EMAIL:'verify@example.org'},
    httpFetch:async (_url,opts)=>{
      payload=JSON.parse(opts.body);
      assert.equal(opts.headers.authorization,'Bearer test-only');
      return {ok:true};
    }
  });
  assert.equal(payload.from,'verify@example.org');
  assert.deepEqual(payload.to,['newuser@example.org']);
});
