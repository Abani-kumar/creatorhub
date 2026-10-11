import { authed } from '@/server/http';
import { isDemoMode } from '@/server/services/demo';
import { toCreatorView } from '@/server/services/shared';
import type { MeResponse } from '@/lib/types';

export const dynamic = 'force-dynamic';

export const GET = authed({}, async ({ creator }): Promise<MeResponse> => ({
  creator: toCreatorView(creator),
  demoMode: isDemoMode(),
}));
