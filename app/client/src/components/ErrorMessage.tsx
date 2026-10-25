/** A page or section error, announced to screen readers. Renders nothing without an error. */
export function ErrorMessage({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p className="error" role="alert">
      {error}
    </p>
  );
}
