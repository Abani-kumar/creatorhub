/**
 * Synthetic demo data. Deterministic (seeded PRNG) but dated relative to "now", so the
 * "this month" numbers and the chart always look alive no matter when the demo is opened.
 *
 *  - Maya Okafor  (verified):   14 content records (9 published, 3 draft, 2 scheduled), 400+ purchases
 *  - Sam Rivera   (unverified): 3 drafts, no purchases -> shows the publish gate and empty states
 */
import { DB_VERSION } from '@/lib/constants';
import type { Content, Creator, Database, Purchase, PurchaseStatus, Upload } from '@/lib/types';

export const SEEDED = { maya: 'cr_maya', sam: 'cr_sam' } as const;
export const SEEDED_IDS: string[] = Object.values(SEEDED);

const DAY = 86_400_000;

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const COUNTRY_WEIGHTS: [string, number][] = [
  ['US', 30], ['IN', 12], ['GB', 9], ['DE', 7], ['BR', 6], ['CA', 6], ['AU', 5], ['FR', 4],
  ['NG', 3], ['JP', 3], ['MX', 3], ['ES', 3], ['ID', 2], ['NL', 2], ['SE', 1], ['ZA', 1], ['KR', 1], ['PH', 1],
];
const COUNTRY_TOTAL = COUNTRY_WEIGHTS.reduce((s, [, w]) => s + w, 0);

interface PublishedSpec {
  title: string;
  description: string;
  priceCents: number;
  ageDays: number;
  minutes: number;
  sizeMB: number;
  weight: number;
}

const PUBLISHED: PublishedSpec[] = [
  { title: 'Cinematic Color Grading in DaVinci Resolve', description: 'A complete grading workflow from log footage to a finished look, with node trees you can reuse on every project.', priceCents: 2499, ageDays: 132, minutes: 48, sizeMB: 2650, weight: 1.0 },
  { title: 'Street Photography Masterclass: Tokyo at Night', description: 'Shoot confident night frames with available light. Includes a full walkthrough of three Tokyo neighbourhoods.', priceCents: 1999, ageDays: 118, minutes: 36, sizeMB: 1820, weight: 0.8 },
  { title: 'Build a Portfolio Site in a Weekend', description: 'Plan, design and ship a fast portfolio site without a template. Beginner friendly, no paid tools required.', priceCents: 1499, ageDays: 97, minutes: 54, sizeMB: 2210, weight: 0.65 },
  { title: "Beginner's Guide to Sourdough", description: 'From starter to a crackling crust. Every step filmed overhead so you can follow along in your own kitchen.', priceCents: 999, ageDays: 86, minutes: 27, sizeMB: 1240, weight: 0.55 },
  { title: 'Home Studio Acoustics on a Budget', description: 'Treat a bedroom or spare room for recording using inexpensive materials, with before and after measurements.', priceCents: 1799, ageDays: 71, minutes: 33, sizeMB: 1510, weight: 0.5 },
  { title: 'Mobile Filmmaking: Shoot Like a Pro', description: 'Get cinematic results from the phone in your pocket: framing, stabilisation, audio and editing on the go.', priceCents: 1299, ageDays: 55, minutes: 31, sizeMB: 1390, weight: 0.42 },
  { title: 'Motion Design Foundations in After Effects', description: 'Timing, easing and composition fundamentals that make every animation feel intentional.', priceCents: 2999, ageDays: 38, minutes: 58, sizeMB: 3040, weight: 0.38 },
  { title: 'Podcast Production Workflow, Start to Finish', description: 'Record, edit, master and publish a podcast episode in a repeatable weekly workflow.', priceCents: 1599, ageDays: 24, minutes: 41, sizeMB: 1760, weight: 0.28 },
  { title: 'Vlog Storytelling: From Idea to Edit', description: 'Turn everyday footage into a story people finish watching. Includes my full editing checklist.', priceCents: 1199, ageDays: 11, minutes: 29, sizeMB: 1310, weight: 0.2 },
];

interface DraftSpec { title: string; description: string; priceCents: number | null; withVideo: boolean; minutes: number; sizeMB: number; withThumb: boolean; createdDaysAgo: number }

const MAYA_DRAFTS: DraftSpec[] = [
  { title: 'Lighting for Small Spaces', description: '', priceCents: null, withVideo: false, minutes: 0, sizeMB: 0, withThumb: false, createdDaysAgo: 4 },
  { title: 'Travel Edit Pack: Behind the Scenes', description: 'How I cut a three-minute travel film from a week of footage, shot by shot.', priceCents: 1399, withVideo: true, minutes: 22, sizeMB: 980, withThumb: true, createdDaysAgo: 6 },
  { title: 'Sound Design for Short Films', description: 'Layering ambience, foley and music so a quiet scene still feels alive.', priceCents: 1699, withVideo: true, minutes: 35, sizeMB: 1610, withThumb: true, createdDaysAgo: 2 },
];

const MAYA_SCHEDULED = [
  { title: 'Documentary Interviews: Ask Better Questions', description: 'Interview technique for first-time documentary makers: preparation, follow-ups and handling silence.', priceCents: 2199, inDays: 3, minutes: 44, sizeMB: 2050 },
  { title: 'Time-lapse Techniques Workshop', description: 'Plan, shoot and grade time-lapses that look smooth, from sunrise to star trails.', priceCents: 1399, inDays: 9, minutes: 26, sizeMB: 1180 },
];

const SAM_DRAFTS: DraftSpec[] = [
  { title: 'My First Tutorial', description: '', priceCents: null, withVideo: false, minutes: 0, sizeMB: 0, withThumb: false, createdDaysAgo: 1 },
  { title: 'Pottery for Beginners: Wheel Basics', description: 'Centering clay, pulling walls and trimming a first bowl. No studio required.', priceCents: 1299, withVideo: true, minutes: 31, sizeMB: 1420, withThumb: true, createdDaysAgo: 3 },
  { title: 'Weekend Hike Vlog: Lake Loop', description: 'A relaxed trail vlog with route notes and what I pack for a day hike.', priceCents: 799, withVideo: true, minutes: 18, sizeMB: 860, withThumb: true, createdDaysAgo: 5 },
];

export function buildSeed(nowDate: Date): Database {
  const rand = mulberry32(20261010);
  const nowMs = nowDate.getTime();
  const iso = (ms: number) => new Date(ms).toISOString();

  const creators: Creator[] = [
    {
      id: SEEDED.maya,
      name: 'Maya Okafor',
      email: 'maya@demo.creatorhub.test',
      createdAt: iso(nowMs - 150 * DAY),
      verification: {
        status: 'verified',
        submission: {
          fullName: 'Maya Okafor', dateOfBirth: '1991-04-18', country: 'GB', addressLine: '14 Larkspur Road',
          city: 'Bristol', postalCode: 'BS6 5AB', documentType: 'passport', documentFileName: 'passport-scan.jpg',
          documentSizeBytes: 1_480_000, selfieMethod: 'simulated', selfieCompletedAt: iso(nowMs - 148 * DAY),
        },
        submittedAt: iso(nowMs - 148 * DAY),
        reviewedAt: iso(nowMs - 147 * DAY),
        rejectionReason: null,
      },
    },
    {
      id: SEEDED.sam,
      name: 'Sam Rivera',
      email: 'sam@demo.creatorhub.test',
      createdAt: iso(nowMs - 6 * DAY),
      verification: { status: 'unverified', submission: null, submittedAt: null, reviewedAt: null, rejectionReason: null },
    },
  ];

  const content: Content[] = [];
  const uploads: Upload[] = [];
  let n = 0;

  const makeContent = (
    creatorId: string,
    spec: { title: string; description: string; priceCents: number | null; minutes: number; sizeMB: number; withVideo?: boolean; withThumb?: boolean },
    status: Content['status'],
    createdMs: number,
    extra: Partial<Content> = {},
  ): Content => {
    n += 1;
    const id = `cnt_${String(n).padStart(2, '0')}`;
    const hasVideo = spec.withVideo ?? true;
    let video: Content['video'] = null;
    if (hasVideo) {
      const uploadId = `upl_seed_${String(n).padStart(2, '0')}`;
      const slug = spec.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
      const fileName = `${slug}.mp4`;
      const sizeBytes = spec.sizeMB * 1024 * 1024;
      uploads.push({
        id: uploadId, creatorId, fileName, sizeBytes, contentType: 'video/mp4', status: 'uploaded',
        createdAt: iso(createdMs), uploadedAt: iso(createdMs + 20 * 60_000), processingFails: false,
      });
      video = { uploadId, fileName, sizeBytes, durationSec: spec.minutes * 60 + Math.floor(rand() * 50) };
    }
    return {
      id, creatorId, title: spec.title, description: spec.description, priceCents: spec.priceCents,
      thumbnailUrl: (spec.withThumb ?? true) ? `/thumbs/${id}` : null,
      video, status, scheduledFor: null, publishedAt: null, publishIntent: null, lastPublishError: null,
      views: 0, createdAt: iso(createdMs), updatedAt: iso(createdMs), ...extra,
    };
  };

  /* ---- Maya: published ---- */
  const published: Content[] = PUBLISHED.map((s) => {
    const publishedMs = nowMs - s.ageDays * DAY;
    const c = makeContent(SEEDED.maya, s, 'published', publishedMs - 3 * DAY, { publishedAt: iso(publishedMs), updatedAt: iso(publishedMs) });
    content.push(c);
    return c;
  });

  /* ---- Maya: drafts + scheduled, Sam: drafts ---- */
  MAYA_DRAFTS.forEach((d) => content.push(makeContent(SEEDED.maya, d, 'draft', nowMs - d.createdDaysAgo * DAY)));
  MAYA_SCHEDULED.forEach((s) => {
    const when = nowMs + s.inDays * DAY + 3_600_000 * 2;
    content.push(makeContent(SEEDED.maya, s, 'scheduled', nowMs - 2 * DAY, { scheduledFor: iso(when) }));
  });
  SAM_DRAFTS.forEach((d) => content.push(makeContent(SEEDED.sam, d, 'draft', nowMs - d.createdDaysAgo * DAY)));

  /* ---- purchases (Maya only) ---- */
  const purchases: Purchase[] = [];
  const TOTAL_PURCHASES = 420;
  const weightSum = PUBLISHED.reduce((s, p) => s + p.weight, 0);
  let pn = 0;
  PUBLISHED.forEach((spec, i) => {
    const c = published[i];
    const count = Math.round((TOTAL_PURCHASES * spec.weight) / weightSum);
    for (let k = 0; k < count; k++) {
      pn += 1;
      const daysAgo = (spec.ageDays - 1) * Math.pow(rand(), 1.05) + rand();
      let r = rand() * COUNTRY_TOTAL;
      let country = 'US';
      for (const [code, w] of COUNTRY_WEIGHTS) {
        if ((r -= w) <= 0) { country = code; break; }
      }
      const roll = rand();
      const status: PurchaseStatus = roll < 0.84 ? 'completed' : roll < 0.9 ? 'refunded' : roll < 0.95 ? 'failed' : 'completed';
      purchases.push({
        id: `pur_${String(pn).padStart(4, '0')}`, creatorId: SEEDED.maya, contentId: c.id, contentTitle: c.title,
        amountCents: spec.priceCents, country, status, createdAt: iso(nowMs - daysAgo * DAY),
      });
    }
  });
  // A few completed sales earlier today (UTC), so the chart's last point isn't an artificial cliff.
  const dayStart = Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth(), nowDate.getUTCDate());
  if (nowMs - dayStart > 30 * 60_000) {
    for (let k = 0; k < 6; k++) {
      const i = Math.floor(rand() * published.length);
      pn += 1;
      purchases.push({
        id: `pur_${String(pn).padStart(4, '0')}`, creatorId: SEEDED.maya, contentId: published[i].id, contentTitle: published[i].title,
        amountCents: PUBLISHED[i].priceCents, country: 'US', status: 'completed', createdAt: iso(dayStart + rand() * (nowMs - dayStart - 60_000)),
      });
    }
  }
  // Guarantee every status is visible near the top of the "recent purchases" table.
  purchases.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const force: [number, PurchaseStatus][] = [[0, 'pending'], [1, 'completed'], [2, 'pending'], [4, 'failed'], [7, 'refunded']];
  force.forEach(([idx, st]) => { purchases[idx].status = st; });
  // Pending only makes sense for very recent purchases.
  purchases.forEach((p) => {
    if (p.status === 'pending' && nowMs - Date.parse(p.createdAt) > 2 * DAY) p.status = 'completed';
  });

  /* ---- views derived from completed purchases and a per-content conversion rate ---- */
  published.forEach((c) => {
    const completed = purchases.filter((p) => p.contentId === c.id && p.status === 'completed').length;
    const conversion = 0.03 + rand() * 0.06;
    c.views = Math.round(completed / conversion);
  });

  return {
    version: DB_VERSION,
    creators,
    content,
    purchases,
    uploads,
    sessions: [],
    demo: { latencyMs: 0, forceApiErrors: false, failNextUpload: false, failNextProcessing: false, jobsLastRunAt: null },
  };
}
