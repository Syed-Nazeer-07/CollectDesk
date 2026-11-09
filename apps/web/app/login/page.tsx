import AuthWorkspace from '@/components/AuthWorkspace';

export default async function Login({searchParams}:{searchParams:Promise<{mode?:string}>}){
  const params=await searchParams;
  return <AuthWorkspace initialMode={params.mode==='signup'?'signup':'login'}/>;
}
