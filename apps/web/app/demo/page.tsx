import {redirect} from 'next/navigation';

// Preserve existing links without keeping a second, misleading role-selector page.
export default function LegacyAccessPage(){redirect('/account');}
