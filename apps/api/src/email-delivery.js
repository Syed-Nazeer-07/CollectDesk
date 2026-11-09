/**
 * Verification-email delivery for the fictional CollectDesk preview.
 *
 * Select one explicitly configured sender. Resend is preferred when both
 * providers are present; Gmail SMTP is a simple alternative for small demos.
 * Never print delivery credentials, tokens or recipient data to logs.
 */
import nodemailer from 'nodemailer';

export function emailDeliveryProvider(env=process.env){
  if(env.RESEND_API_KEY?.trim() && env.AUTH_FROM_EMAIL?.trim())return 'resend';
  if(env.GMAIL_SMTP_USER?.trim() && env.GMAIL_SMTP_APP_PASSWORD?.trim())return 'gmail';
  return null;
}

export async function sendVerificationEmail(email,url,{
  env=process.env,httpFetch=fetch,createTransport=nodemailer.createTransport
}={}){
  const provider=emailDeliveryProvider(env);
  if(!provider)throw new Error('No verification email provider configured');
  const subject='Verify your CollectDesk demo account';
  const text='Verify your email to activate your fictional CollectDesk creditor account:\n'+url+
    '\n\nThis link expires in 30 minutes. If you did not request an account, ignore this email.';

  if(provider==='resend'){
    const response=await httpFetch('https://api.resend.com/emails',{
      method:'POST',
      headers:{authorization:'Bearer '+env.RESEND_API_KEY,'content-type':'application/json','user-agent':'CollectDesk-Demo/1.0'},
      body:JSON.stringify({from:env.AUTH_FROM_EMAIL,to:[email],subject,text}),
      signal:AbortSignal.timeout(10000)
    });
    if(!response.ok)throw new Error('Email provider refused the verification message');
    return;
  }

  // SSL/TLS on port 465; never allow unencrypted SMTP or account passwords.
  const sender=env.GMAIL_SMTP_USER.trim();
  const transporter=createTransport({
    host:'smtp.gmail.com',port:465,secure:true,
    auth:{user:sender,pass:env.GMAIL_SMTP_APP_PASSWORD.replace(/\s/g,'')},
    connectionTimeout:10000,greetingTimeout:10000,socketTimeout:12000
  });
  try{
    const result=await transporter.sendMail({
      from:{name:'CollectDesk',address:sender},to:email,subject,text
    });
    if(result.rejected?.length)throw new Error('Gmail rejected the verification email');
  }finally{
    transporter.close?.();
  }
}
