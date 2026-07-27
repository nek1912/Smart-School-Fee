export default function ErrorState({ message }) {
  if (!message) return null;
  return <div className="alert alert-error">{message}</div>;
}