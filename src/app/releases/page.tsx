import Link from "next/link";

/** Placeholder — new releases browsing comes later. */
export default function ReleasesPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-black px-6 text-center">
      <p className="top-link" style={{ pointerEvents: "none" }}>
        Releases
      </p>
      <p
        style={{
          fontFamily: '"Times New Roman", Times, serif',
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "rgba(245, 246, 248, 0.78)",
          fontSize: "0.75rem",
          margin: 0,
        }}
      >
        Coming soon
      </p>
      <Link href="/" className="top-link">
        Back
      </Link>
    </main>
  );
}
