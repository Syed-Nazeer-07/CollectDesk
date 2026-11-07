import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={title:'CollectDesk · Commercial Collections',description:'B2B case management and invoice recovery tracking. Fictional demo.'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>;}
