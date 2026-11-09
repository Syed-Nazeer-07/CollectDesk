import type {Metadata} from 'next';
import ResetPassword from '@/components/ResetPassword';

export const metadata:Metadata={
  title:'Reset password · CollectDesk',
  robots:{index:false,follow:false}
};

export default async function Page({searchParams}:{searchParams:Promise<{token?:string}>}){
  const params=await searchParams;
  return <ResetPassword token={params.token||''}/>;
}
