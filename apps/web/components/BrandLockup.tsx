import Link from 'next/link';
import BrandMark from '@/components/BrandMark';

/** Compact brand signature for standalone onboarding and recovery screens. */
export default function BrandLockup(){
  return <Link href="/" className="cd-brand-lockup" aria-label="collectDesk home">
    <BrandMark className="cd-brand-lockup-icon"/>
    <span>collect<span>Desk</span></span>
  </Link>;
}
