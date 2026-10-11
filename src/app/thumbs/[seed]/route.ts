import { thumbnailSvg } from '@/lib/thumbnail';

export async function GET(req: Request, ctx: { params: Promise<{ seed: string }> }) {
  const { seed } = await ctx.params;
  const title = new URL(req.url).searchParams.get('title');
  return new Response(thumbnailSvg(seed, title), {
    headers: { 'content-type': 'image/svg+xml', 'cache-control': 'public, max-age=31536000, immutable' },
  });
}
