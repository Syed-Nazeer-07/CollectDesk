import {redirect} from 'next/navigation';

// Legacy signup links open the account-creation mode on the login screen.
export default function Signup(){
  redirect('/login?mode=signup');
}
