import Link from "next/link";
import { Wordmark } from "@/components/ui";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative isolate flex min-h-dvh flex-col items-center justify-center px-4 py-12">
      <div className="sunburst pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[55vh] opacity-40" aria-hidden />
      <Link href="/" aria-label="Mohar home" className="mb-8"><Wordmark /></Link>
      <main className="panel w-full max-w-md p-7 sm:p-9">{children}</main>
    </div>
  );
}
