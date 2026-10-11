/** Decorative "edit timeline" used on the sign-in screen: clips on tracks, with the rose playhead. */
const TRACKS: { clips: { w: number; seed: string }[]; offset: number }[] = [
  { offset: 0, clips: [{ w: 34, seed: 'cnt_01' }, { w: 22, seed: 'cnt_05' }, { w: 30, seed: 'cnt_03' }] },
  { offset: 10, clips: [{ w: 26, seed: 'cnt_02' }, { w: 40, seed: 'cnt_07' }, { w: 18, seed: 'cnt_04' }] },
  { offset: 4, clips: [{ w: 20, seed: 'cnt_06' }, { w: 32, seed: 'cnt_08' }, { w: 28, seed: 'cnt_09' }] },
];

export function TimelineArt() {
  return (
    <div aria-hidden className="relative select-none">
      <div className="flex justify-between px-1 pb-2 font-mono text-[10px] text-night-text/70 tabular-nums">
        {['00:00', '00:10', '00:20', '00:30', '00:40'].map((t) => <span key={t}>{t}</span>)}
      </div>
      <div className="space-y-2.5">
        {TRACKS.map((track, i) => (
          <div key={i} className="flex gap-1.5 rounded-lg bg-white/[0.04] p-1.5" style={{ paddingLeft: `${track.offset}%` }}>
            {track.clips.map((c) => (
              <div
                key={c.seed}
                className="h-12 rounded-md ring-1 ring-white/15"
                style={{ width: `${c.w}%`, backgroundImage: `url(/thumbs/${c.seed})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
              />
            ))}
          </div>
        ))}
      </div>
      {/* playhead */}
      <div className="absolute inset-y-0 left-[58%] w-px bg-accent">
        <span className="absolute -top-0.5 left-1/2 size-3 -translate-x-1/2 rotate-45 rounded-[2px] bg-accent" />
      </div>
    </div>
  );
}
