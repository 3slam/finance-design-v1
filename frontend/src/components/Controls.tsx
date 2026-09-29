interface Props {
  index: number;
  total: number;
  playing: boolean;
  onPrev: () => void;
  onNext: () => void;
  onPlay: () => void;
  onPause: () => void;
}

export default function Controls({ index, total, playing, onPrev, onNext, onPlay, onPause }: Props) {
  const atStart = index <= -1;
  const atEnd = index >= total;

  return (
    <div className="flex items-center justify-center gap-3">
      <button onClick={onPrev} disabled={atStart} className="rounded-full border border-border px-4 py-2 text-body-m font-medium text-text-secondary hover:bg-bg-field disabled:opacity-30">
        ◀ Back
      </button>
      <button
        onClick={playing ? onPause : onPlay}
        disabled={atEnd}
        className="rounded-full bg-brand px-6 py-2 text-body-m font-semibold text-white hover:bg-brand-hover disabled:opacity-30"
      >
        {playing ? '❙❙ Pause' : '▶ Play'}
      </button>
      <button onClick={onNext} disabled={atEnd} className="rounded-full border border-border px-4 py-2 text-body-m font-medium text-text-secondary hover:bg-bg-field disabled:opacity-30">
        Next ▶
      </button>
      <div className="ml-2 flex gap-1">
        {Array.from({ length: total }).map((_, i) => (
          <div key={i} className={`h-1.5 w-4 rounded-full ${i <= index ? 'bg-brand' : 'bg-border'}`} />
        ))}
      </div>
    </div>
  );
}
