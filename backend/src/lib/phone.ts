// Store phone numbers: STORE_PHONE can hold one or more numbers separated by
// commas, e.g. "9789562928, 9003071616".

export interface PhoneNumber {
  /** How to show it, e.g. "+91 97895 62928" */
  display: string;
  /** For tap-to-call links (tel:+919789562928) */
  tel: string;
}

/** "9789562928, 9003071616" → [{ display: "+91 97895 62928", tel: "+919789562928" }, …] */
export function parsePhoneList(value: string): PhoneNumber[] {
  return value
    .split(/[,;/]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map(formatPhone);
}

function formatPhone(raw: string): PhoneNumber {
  const digits = raw.replace(/\D/g, '');
  // Indian mobile numbers: 10 digits starting with 6–9, optionally written with 0, 91 or +91 in front.
  const mobile = digits.match(/^(?:91|0)?([6-9]\d{9})$/);
  if (mobile) {
    const number = mobile[1];
    return { display: `+91 ${number.slice(0, 5)} ${number.slice(5)}`, tel: `+91${number}` };
  }
  // Anything else (e.g. a landline with its STD code): show it as written.
  return { display: raw, tel: raw.startsWith('+') ? `+${digits}` : digits };
}
