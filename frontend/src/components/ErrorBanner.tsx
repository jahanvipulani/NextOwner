interface Props {
  message: string | null;
  onRetry?: () => void;
}

export default function ErrorBanner({ message, onRetry }: Props) {
  if (!message) return null;
  return (
    <div className="banner banner-warn flex flex-wrap items-center gap-3" role="alert">
      <span className="grow">{message}</span>
      {onRetry ? (
        <button type="button" className="btn btn-sm" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}
