import VerifyEmail from '@/components/VerifyEmail';
export default async function Page({searchParams}:{searchParams:Promise<{token?:string}>}){
  const params=await searchParams;
  return <VerifyEmail token={params.token||''}/>;
}
