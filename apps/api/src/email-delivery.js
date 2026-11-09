/**
 * Verification-email delivery for the fictional CollectDesk preview.
 *
 * Select one explicitly configured sender. Resend is preferred when both
 * providers are present; Gmail SMTP works locally or on hosts allowing SMTP.
 * Never print delivery credentials, tokens or recipient data to logs.
 */
import nodemailer from 'nodemailer';

export function emailDeliveryProvider(env=process.env){
  if(env.RESEND_API_KEY?.trim() && env.AUTH_FROM_EMAIL?.trim())return 'resend';
  if(env.BREVO_API_KEY?.trim() && env.BREVO_FROM_EMAIL?.trim())return 'brevo';
  // Render Free blocks SMTP ports; avoid advertising a signup method that cannot send.
  // Paid Render instances can opt in explicitly after confirming outbound SMTP access.
  const renderSmtpAllowed=env.RENDER!=='true'||env.ALLOW_SMTP_ON_RENDER==='true';
  if(renderSmtpAllowed && env.GMAIL_SMTP_USER?.trim() && env.GMAIL_SMTP_APP_PASSWORD?.trim())return 'gmail';
  return null;
}

export async function sendVerificationEmail(email,url,options={}){
  return sendAccountEmail(email,url,'verification',options);
}

export async function sendPasswordResetEmail(email,url,options={}){
  return sendAccountEmail(email,url,'password-reset',options);
}

async function sendAccountEmail(email,url,kind,{
  env=process.env,httpFetch=fetch,createTransport=nodemailer.createTransport
}={}){
  const provider=emailDeliveryProvider(env);
  if(!provider)throw new Error('No account email provider configured');
  const passwordReset=kind==='password-reset';
  const subject=passwordReset?'Reset your CollectDesk password':'Verify your CollectDesk account';
  const text=(passwordReset
    ?'Someone requested a password reset for your CollectDesk account. Use this link to set a new password:\n'
    :'Confirm your email to activate your CollectDesk creditor workspace (sample-data preview):\n')+url+
    '\n\nThis link expires in 30 minutes and can be used once. If you did not request this, ignore this email.';

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

  if(provider==='brevo'){
    const response=await httpFetch('https://api.brevo.com/v3/smtp/email',{
      method:'POST',
      headers:{'api-key':env.BREVO_API_KEY,'content-type':'application/json','accept':'application/json'},
      body:JSON.stringify({
        sender:{name:'CollectDesk',email:env.BREVO_FROM_EMAIL},
        to:[{email}],subject,textContent:text
      }),
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
