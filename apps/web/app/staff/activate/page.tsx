import type {Metadata} from 'next';
import ActivateStaff from './ActivateStaff';

export const metadata:Metadata={
  title:'Activate staff invitation · CollectDesk',
  robots:{index:false,follow:false},
  referrer:'no-referrer'
};
export default function Page(){return <ActivateStaff/>;}
