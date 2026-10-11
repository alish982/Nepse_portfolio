"use client";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="panel panel-quiet mx-auto max-w-xl px-6 py-12 text-center">
      <h1 className="text-3xl">Something went wrong</h1>
      <p className="mt-3 text-mute">
        {error.message.startsWith("Could not") ? error.message : "We couldn't load this page."} Your data is safe. Try again, and if it keeps happening, check your connection.
      </p>
      <button onClick={reset} className="btn mt-6">Try again</button>
    </div>
  );
}
