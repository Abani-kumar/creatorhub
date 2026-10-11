import { Play } from 'lucide-react';

export function BrandMark({ className = 'size-9' }: { className?: string }) {
  return (
    <span className={`grid shrink-0 place-items-center rounded-[10px] bg-accent text-white ${className}`} aria-hidden>
      <Play className="size-[45%] translate-x-[1px] fill-current" />
    </span>
  );
}
