interface Props {
  title: string;
  loading: boolean;
  onRefresh: () => void;
}

export function PageToolbar({ title, loading, onRefresh }: Props) {
  return (
    <div className="page-toolbar">
      <h1>{title}</h1>
      <button onClick={onRefresh} disabled={loading} title="Fetch fresh data from FPL, skipping the 30-minute cache">
        {loading ? 'Loading…' : 'Refresh'}
      </button>
    </div>
  );
}
