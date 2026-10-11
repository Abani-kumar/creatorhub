/**
 * Infrastructure cost model for docs/ARCHITECTURE.md:  npm run cost-model
 *
 * Every number the document quotes comes from this file, so the arithmetic can be audited and re-run with
 * different assumptions. It is a PLANNING ESTIMATE, not a quote. Prices were checked against public sources in
 * October 2026 (see PRICE_SOURCES) and must be re-validated against the provider's own pricing page / calculator
 * before anyone commits money. Third-party aggregators were used for AWS rates; they agreed with each other.
 *
 * Out of scope on purpose: payment processing fees, staff, legal/DRM licences, taxes, support plans, and any
 * negotiated or committed-use discounts (they are real and large, but unvalidated here).
 */

/* ------------------------------- assumptions ------------------------------- */

const A = {
  creators: 100_000,
  library: 1_000_000, // videos stored (steady state)
  newUploadsPerMonth: 40_000, // ~4% monthly growth of the library
  views: 10_000_000, // per month
  mbPerView: 60, // the brief's illustrative figure (~2 min at ~4 Mbps). Sensitivity below uses more.
  avgMinutes: 10, // average video length
  originalMB: 500, // average uploaded file (~6.7 Mbps)
  // Adaptive-bitrate ladder, Mbps (H.264). Rung size = Mbps * seconds / 8.
  ladder: { '1080p': 4.0, '720p': 2.2, '480p': 1.1, '360p': 0.6 },
  // Share of delivered bytes by viewer region (synthetic, loosely shaped like the demo's purchase mix).
  geo: { 'NA/EU': 0.55, India: 0.12, 'Asia (other)': 0.10, 'South America': 0.08, 'AU/NZ': 0.05, 'Middle East/Africa': 0.10 },
  httpsRequestsPerView: 45, // 6 s segments over ~4 min + manifests
  platformAndOps: 8_000, // API compute, managed Postgres, queue, observability. A placeholder, NOT validated.
  // Popularity tiers for the optimized design (fraction of library). ~5% of videos draw most views.
  tiers: { hot: 0.05, warm: 0.25, tail: 0.70 },
};

/* ---------------------------------- prices ---------------------------------- */
// USD. TB = 1,000 GB for billing arithmetic (cloud providers bill decimal GB for transfer; close enough here).

const PRICE_SOURCES = {
  s3: 'S3 Standard $0.023/0.022/0.021 per GB-mo (first 50 TB / next 450 TB / over 500 TB); Glacier Instant Retrieval $0.004 + $0.03/GB retrieval',
  cloudfront:
    'CloudFront pay-as-you-go tiers per region: 10 TB / next 40 / next 100 / next 350 / rest. NA+EU 0.085/0.080/0.060/0.040/0.020; India 0.109/0.104/0.090/0.070/0.060; MEA 0.110/0.105/0.090/0.070/0.060; AU+NZ 0.114/0.109/0.090/0.070/0.060; S. America 0.170/0.163/0.140/0.120/0.100. "Asia (other)" starts at 0.120; later tiers are INTERPOLATED. HTTPS requests $0.01 per 10k (US/EU). 1 TB/month free tier ignored (<$100).',
  mediaconvert: 'MediaConvert Basic tier, AVC single pass: ~$0.0075/min SD; HD taken as 2x that. Volume discounts exist and are NOT applied (conservative).',
  bunny: 'S3 internet egress ~$0.09/GB (first 10 TB) is charged when renditions are copied from S3 to CDN-side storage. Bunny CDN Volume network $0.005/GB flat (first 500 TB); Standard network $0.01 EU/NA, $0.03 Asia/Oceania, $0.045 S. America, $0.06 Middle East/Africa; Bunny Storage ~$0.01/GB-mo (2 regions); no CDN request fees, no storage-to-CDN egress.',
};

const CF_TIER_TB = [10, 40, 100, 350, Infinity];
const CF_RATES: Record<string, number[]> = {
  'NA/EU': [0.085, 0.08, 0.06, 0.04, 0.02],
  India: [0.109, 0.104, 0.09, 0.07, 0.06],
  'Asia (other)': [0.12, 0.114, 0.098, 0.075, 0.06],
  'South America': [0.17, 0.163, 0.14, 0.12, 0.1],
  'AU/NZ': [0.114, 0.109, 0.09, 0.07, 0.06],
  'Middle East/Africa': [0.11, 0.105, 0.09, 0.07, 0.06],
};
const BUNNY_STANDARD: Record<string, number> = { 'NA/EU': 0.01, India: 0.03, 'Asia (other)': 0.03, 'South America': 0.045, 'AU/NZ': 0.03, 'Middle East/Africa': 0.06 };

const s3Standard = (tb: number) => {
  const gb = (t: number) => t * 1000;
  const t1 = Math.min(tb, 50);
  const t2 = Math.min(Math.max(tb - 50, 0), 450);
  const t3 = Math.max(tb - 500, 0);
  return gb(t1) * 0.023 + gb(t2) * 0.022 + gb(t3) * 0.021;
};

function cloudfrontTransfer(totalTB: number): { total: number; byRegion: Record<string, number> } {
  const byRegion: Record<string, number> = {};
  for (const [region, share] of Object.entries(A.geo)) {
    let left = totalTB * share;
    let cost = 0;
    CF_TIER_TB.forEach((cap, i) => {
      const used = Math.min(left, cap);
      cost += used * 1000 * CF_RATES[region][i];
      left -= used;
    });
    byRegion[region] = cost;
  }
  return { total: Object.values(byRegion).reduce((a, b) => a + b, 0), byRegion };
}

/* ---------------------------------- model ---------------------------------- */

const MB_PER_TB = 1_000_000;
const seconds = A.avgMinutes * 60;
const rungMB = Object.fromEntries(Object.entries(A.ladder).map(([k, mbps]) => [k, (mbps * seconds) / 8])) as Record<string, number>;
const sum = (keys: string[]) => keys.reduce((s, k) => s + rungMB[k], 0);
const HD = new Set(['1080p', '720p']);
const mcPerMin = (rungs: string[]) => rungs.reduce((s, r) => s + (HD.has(r) ? 0.015 : 0.0075), 0);

const deliveredTB = (mbPerView: number) => (A.views * mbPerView) / MB_PER_TB;

export function scenarioA(mbPerView = A.mbPerView) {
  const originalsTB = (A.library * A.originalMB) / MB_PER_TB;
  const processedTB = (A.library * sum(Object.keys(A.ladder))) / MB_PER_TB;
  const storage = s3Standard(originalsTB + processedTB);
  const transcode = A.newUploadsPerMonth * A.avgMinutes * mcPerMin(Object.keys(A.ladder));
  const delivery = cloudfrontTransfer(deliveredTB(mbPerView)).total;
  const requests = (A.views * A.httpsRequestsPerView * 0.01) / 10_000;
  const platform = A.platformAndOps;
  return { originalsTB, processedTB, storage, transcode, handoff: 0, delivery, requests, platform, total: storage + transcode + delivery + requests + platform };
}

export function scenarioB(mbPerView = A.mbPerView, regionalStandard = false) {
  const originalsTB = (A.library * A.originalMB) / MB_PER_TB;
  const all = Object.keys(A.ladder);
  const perTier = { hot: sum(all), warm: sum(['720p', '480p', '360p']), tail: sum(['720p', '360p']) };
  const processedTB = (A.library * (A.tiers.hot * perTier.hot + A.tiers.warm * perTier.warm + A.tiers.tail * perTier.tail)) / MB_PER_TB;

  const originals = originalsTB * 1000 * 0.004 + (originalsTB * 1000 * 0.02 * 0.03); // Glacier IR + ~2%/month re-read for re-transcodes
  const processed = processedTB * 1000 * 0.01;
  // Transcode a 2-rung ladder on ingest (popularity is unknown), then add rungs only when a video earns them.
  const ingest = A.newUploadsPerMonth * A.avgMinutes * mcPerMin(['720p', '360p']);
  const promote =
    A.newUploadsPerMonth * A.avgMinutes * (A.tiers.hot * mcPerMin(['1080p', '480p']) + A.tiers.warm * mcPerMin(['480p']));
  const transcode = ingest + promote;

  // MediaConvert writes only to S3, so renditions leave AWS once to reach CDN-side storage: S3 internet egress ($0.09/GB).
  const monthlyNewMB =
    A.newUploadsPerMonth * (sum(['720p', '360p']) + A.tiers.hot * sum(['1080p', '480p']) + A.tiers.warm * rungMB['480p']);
  const handoff = (monthlyNewMB / 1000) * 0.09;

  const tb = deliveredTB(mbPerView);
  const delivery = regionalStandard
    ? Object.entries(A.geo).reduce((s, [r, share]) => s + tb * share * 1000 * (r === 'NA/EU' ? 0.005 : BUNNY_STANDARD[r]), 0)
    : tb * 1000 * 0.005;
  const platform = A.platformAndOps;
  const storage = originals + processed;
  return { originalsTB, processedTB, storage, transcode, handoff, delivery, requests: 0, platform, total: storage + transcode + handoff + delivery + platform };
}

/* ---------------------------------- report ---------------------------------- */

const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const row = (label: string, ...cols: number[]) => `| ${label} | ${cols.map(usd).join(' | ')} |`;

function main() {
  const a = scenarioA();
  const b = scenarioB();
  const b2 = scenarioB(A.mbPerView, true);

  console.log('Assumptions');
  console.log(`  library ${A.library.toLocaleString()} videos, ${A.newUploadsPerMonth.toLocaleString()} new/month, ${A.views.toLocaleString()} views/month`);
  console.log(`  avg video ${A.avgMinutes} min, original ${A.originalMB} MB, ladder rungs (MB): ${Object.entries(rungMB).map(([k, v]) => `${k}=${v.toFixed(0)}`).join(' ')}`);
  console.log(`  delivered ${deliveredTB(A.mbPerView).toFixed(0)} TB/month at ${A.mbPerView} MB/view`);
  console.log(`  stored: A originals ${a.originalsTB.toFixed(0)} TB + processed ${a.processedTB.toFixed(0)} TB; B originals ${b.originalsTB.toFixed(0)} TB (cold) + processed ${b.processedTB.toFixed(0)} TB (tiered)\n`);

  console.log('| Monthly line item | A: pay-as-you-go AWS | B: cost-optimized | B+: B with regional Standard CDN |');
  console.log('|---|---|---|---|');
  console.log(row('Storage', a.storage, b.storage, b2.storage));
  console.log(row('Transcoding', a.transcode, b.transcode, b2.transcode));
  console.log(row('Hand-off to CDN storage (S3 egress)', a.handoff, b.handoff, b2.handoff));
  console.log(row('Delivery (CDN transfer)', a.delivery, b.delivery, b2.delivery));
  console.log(row('CDN requests', a.requests, b.requests, b2.requests));
  console.log(row('Platform and ops (placeholder)', a.platform, b.platform, b2.platform));
  console.log(row('**Total**', a.total, b.total, b2.total));
  console.log(`\nB is ${(a.total / b.total).toFixed(1)}x cheaper than A; B+ is ${(a.total / b2.total).toFixed(1)}x cheaper.\n`);

  console.log('CloudFront transfer by region (A):');
  const cf = cloudfrontTransfer(deliveredTB(A.mbPerView));
  for (const [r, c] of Object.entries(cf.byRegion)) console.log(`  ${r.padEnd(20)} ${usd(c)}`);

  console.log('\nSensitivity: delivered MB per view (everything else held constant)');
  console.log('| MB per view | Delivered TB | A total | B total | B+ total |');
  console.log('|---|---|---|---|---|');
  for (const mb of [30, 60, 150, 300]) {
    console.log(`| ${mb} | ${deliveredTB(mb).toFixed(0)} | ${usd(scenarioA(mb).total)} | ${usd(scenarioB(mb).total)} | ${usd(scenarioB(mb, true).total)} |`);
  }

  console.log('\nWhy a 5-view video should not get the same treatment as a 500,000-view one:');
  const hotMB = sum(Object.keys(A.ladder));
  const tailMB = sum(['720p', '360p']);
  const hotMonthly = (hotMB / 1000) * 0.021; // $/month to keep a full ladder hot on S3 Standard
  console.log(`  full ladder ${hotMB.toFixed(0)} MB vs tail ladder ${tailMB.toFixed(0)} MB (${((1 - tailMB / hotMB) * 100).toFixed(0)}% less stored)`);
  console.log(`  transcoding a full ladder costs ${usd(A.avgMinutes * mcPerMin(Object.keys(A.ladder)) * 100)}/100 videos at ingest vs ${usd(A.avgMinutes * mcPerMin(['720p', '360p']) * 100)}/100 for the 2-rung start`);
  console.log(`  keeping one full ladder hot on S3 Standard: ~$${hotMonthly.toFixed(4)}/month; it pays back only if the video is actually watched`);

  console.log('\nPrice sources and caveats:');
  for (const [k, v] of Object.entries(PRICE_SOURCES)) console.log(`  [${k}] ${v}`);
}

if (require.main === module) main();
