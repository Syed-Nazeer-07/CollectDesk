import {z} from 'zod';

// bcrypt silently truncates after 72 UTF-8 bytes.
export const newPassword=z.string().min(12).max(72)
  .regex(/[a-z]/,'Use a lowercase letter.')
  .regex(/[A-Z]/,'Use an uppercase letter.')
  .regex(/[0-9]/,'Use a number.')
  .refine(value=>Buffer.byteLength(value)<=72,'Password must fit within 72 UTF-8 bytes.');
