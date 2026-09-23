/** Contact address shown on legal pages. Set VITE_CONTACT_EMAIL before publishing. */
export const CONTACT_EMAIL = (import.meta.env.VITE_CONTACT_EMAIL as string | undefined)?.trim() || '';

/** Source repository link in the footer. Hidden until VITE_GITHUB_URL is set. */
export const GITHUB_URL = (import.meta.env.VITE_GITHUB_URL as string | undefined)?.trim() || '';
