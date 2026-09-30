interface Props {
  onStart: () => void;
  emoji?: string;
  title?: string;
  description?: string;
}

export default function IntroCard({
  onStart,
  emoji = '🛵📦💰',
  title = 'Meet Ahmed and Seller A',
  description = "Ahmed is a courier carrying three packages for Seller A today. Press start and watch, step by step, how one delivery turns into cash in a customer's hand, a commission in Ahmed's pocket, and money finally landing in Seller A's account.",
}: Props) {
  return (
    <div className="rounded-2xl border border-border bg-bg-surface p-8 text-center shadow-sm">
      <div className="mb-3 text-3xl">{emoji}</div>
      <h2 className="text-heading-l text-ink">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-body-l text-text-secondary">{description}</p>
      <button onClick={onStart} className="mt-6 rounded-full bg-brand px-6 py-2.5 text-body-m font-semibold text-white hover:bg-brand-hover">
        ▶ Start the story
      </button>
    </div>
  );
}
