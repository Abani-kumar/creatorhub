import { json, open } from '@/server/http';
import { isDemoMode } from '@/server/services/demo';

export const dynamic = 'force-dynamic';

/** Public: lets the sign-in page know whether to show the demo shortcuts. */
export const GET = open({}, async ({ creatorId }) => json({ demoMode: isDemoMode(), signedIn: creatorId !== null }));
