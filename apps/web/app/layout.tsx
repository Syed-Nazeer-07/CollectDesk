import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={title:'CollectDesk · Commercial Collections',description:'Commercial case tracking, review workflows, and verified recovery reporting. Preview for sample records only.'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>;}
