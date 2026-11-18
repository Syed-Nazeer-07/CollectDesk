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
  // Local demo environments can still exercise the signup flow without external mail credentials.
  // Production remains fail-closed: signup is only enabled when a real sender is configured.
  if(env.PUBLIC_REGISTRATION_ENABLED==='true' && env.NODE_ENV!=='production')return 'console';
  return null;
}

export async function sendVerificationEmail(email,url,options={}){
  return sendAccountEmail(email,url,'verification',options);
}

export async function sendPasswordResetEmail(email,url,options={}){
  return sendAccountEmail(email,url,'password-reset',options);
}

export async function sendStaffInviteEmail(email,url,options={}){
  return sendAccountEmail(email,url,'staff-invite',options);
}

export async function sendOrganizationInviteEmail(email,url,options={}){
  return sendAccountEmail(email,url,'organization-invite',options);
}

async function sendAccountEmail(email,url,kind,{
  env=process.env,httpFetch=fetch,createTransport=nodemailer.createTransport
}={}){
  const provider=emailDeliveryProvider(env);
  if(!provider)throw new Error('No account email provider configured');
  const passwordReset=kind==='password-reset';
  const staffInvite=kind==='staff-invite';
  const orgInvite=kind==='organization-invite';
  const subject=orgInvite?'Join your organization on CollectDesk':staffInvite?'Your CollectDesk case operator invitation':
    passwordReset?'Reset your CollectDesk password':'Verify your CollectDesk account';
  const text=(orgInvite
    ?'You have been invited to your company’s CollectDesk workspace. Use this link to set up your account:\n'
    :staffInvite
    ?'A CollectDesk administrator has invited you as a case operator to the operations workspace. Use the link to set your password:\n'
    :passwordReset
    ?'Someone requested a password reset for your CollectDesk account. Use this link to set a new password:\n'
    :'Confirm your email to activate your CollectDesk creditor workspace:\n')+url+
    '\n\nThis link expires in '+(staffInvite||orgInvite?'24 hours':'30 minutes')+
    ' and can be used once. If you did not request this, ignore this email.';

  const escape=value=>value.replace(/[&<>"']/g,character=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[character]);
  const [intro, , expiry]=text.split('\n').filter(Boolean);
  const html='<div style="max-width:560px;margin:auto;font:16px/1.6 Arial,sans-serif;color:#172033">'+
    '<p style="color:#9d3817;font-weight:bold">CollectDesk</p><h1 style="font-size:24px">'+escape(subject)+'</h1>'+
    '<p>'+escape(intro)+'</p><p><a href="'+escape(url)+'" style="display:inline-block;background:#9d3817;color:#fff;padding:12px 18px;border-radius:6px">Continue to CollectDesk</a></p>'+
    '<p>'+escape(expiry)+'</p></div>';

  if(provider==='resend'){
    const response=await httpFetch('https://api.resend.com/emails',{
      method:'POST',
      headers:{authorization:'Bearer '+env.RESEND_API_KEY,'content-type':'application/json','user-agent':'CollectDesk/1.0'},
      body:JSON.stringify({from:env.AUTH_FROM_EMAIL,to:[email],subject,text,html}),
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
        to:[{email}],subject,textContent:text,htmlContent:html
      }),
      signal:AbortSignal.timeout(10000)
    });
    if(!response.ok)throw new Error('Email provider refused the verification message');
    return;
  }

  if(provider==='console'){
    const logMessage=`CollectDesk demo email (${kind}): ${subject}\nTo: ${email}\n${text}`;
    console.info(logMessage);
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
      from:{name:'CollectDesk',address:sender},to:email,subject,text,html
    });
    if(result.rejected?.length)throw new Error('Gmail rejected the verification email');
  }finally{
    transporter.close?.();
  }
}
