import Link from "next/link";
export default function NotFound() {
  return (
    <div className="panel py-20 text-center">
      <h1 className="text-xl font-medium">Research record not found</h1>
      <p className="mt-3 text-xs text-muted-foreground">
        The ticker or saved analysis is not available in this workspace.
      </p>
      <Link className="mt-6 inline-block text-sm text-primary" href="/">
        Return to watchlist
      </Link>
    </div>
  );
}
