import { CONTACT_EMAIL } from '../lib/config';

export function ContactEmail() {
  if (CONTACT_EMAIL) return <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>;
  return (
    <span>
      Contact address not yet published <span className="draft-tag">Draft for review</span>
    </span>
  );
}
