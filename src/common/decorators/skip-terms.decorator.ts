import { SetMetadata } from '@nestjs/common';

export const SKIP_TERMS_KEY = 'skipTerms';

/**
 * Allows an authenticated route to run even when the user has not accepted the
 * current terms version — used by the accept-terms route itself and by /me.
 */
export const SkipTerms = () => SetMetadata(SKIP_TERMS_KEY, true);
