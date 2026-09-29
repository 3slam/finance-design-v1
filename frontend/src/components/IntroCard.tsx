interface Props {
  onStart: () => void;
}

export default function IntroCard({ onStart }: Props) {
  return (
    <div className="rounded-2xl border border-surface-border bg-surface-1 p-8 text-center shadow-xl">
      <div className="mb-3 text-3xl">🛵📦💰</div>
      <h2 className="text-lg font-semibold text-slate-50">Meet Ahmed and Seller A</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-400">
        Ahmed is a courier carrying three packages for Seller A today. Press start and watch, step by step, how one
        delivery turns into cash in a customer's hand, a commission in Ahmed's pocket, and money finally landing in
        Seller A's account.
      </p>
      <button onClick={onStart} className="mt-6 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent/90">
        ▶ Start the story
      </button>
    </div>
  );
}
