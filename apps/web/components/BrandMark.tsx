/** Reusable CollectDesk mark. Keep this artwork aligned with app/icon.svg. */
export default function BrandMark({className}:{className?:string}){
  return <svg className={className} viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
    <rect width="48" height="48" rx="12" fill="#FF6A2B"/>
    <path d="M30.8 14.5A12.3 12.3 0 1 0 30.8 33.5" fill="none" stroke="#18212B" strokeWidth="4.4" strokeLinecap="round"/>
    <path d="m20.2 24.6 5.2 5.1L37 18.4" fill="none" stroke="#18212B" strokeWidth="4.4" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>;
}
