import { useEffect, useState } from "react";
import { BackLink } from "@/components/back-link";
import { csr } from "@/lib/compat";

interface Rebuild {
  checkout: string;
  build: string;
  compare: string;
}

interface BuildInfo {
  version: number;
  repo: string;
  commit: string;
  commitTime: string;
  commitUrl: string;
  sbom: string;
  checksums: string;
  attestations: string;
  ciRuns: string;
  rebuild: Rebuild;
  caveats: string[];
}

function Command({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative rounded-md bg-muted">
      <pre className="overflow-x-auto whitespace-pre-wrap break-all p-3 pr-16 text-xs">
        {command}
      </pre>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard.writeText(command).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
        className="absolute top-2 right-2 text-xs font-medium underline underline-offset-4"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

export default csr(function VerifyPage() {
  const [info, setInfo] = useState<BuildInfo | null>(null);

  useEffect(() => {
    fetch("/build-info.json")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: BuildInfo) => setInfo(data))
      .catch(() => {
        setInfo(null);
      });
  }, []);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <BackLink to="/" label="Back to home" />
      <h1 className="text-3xl font-bold tracking-tight">
        Private by design — and provably so
      </h1>
      <p className="mt-3 text-muted-foreground">
        Every tool here runs entirely in your browser. Your files never leave
        your device — no uploads, no accounts, no server processing. And you
        don&apos;t have to take our word for it: below is the exact open-source
        code this deployment runs, plus everything you need to confirm it
        yourself.
      </p>

      {info ? (
        <div className="mt-8 space-y-8">
          <section>
            <h2 className="text-lg font-semibold">
              The code behind your privacy
            </h2>
            <p className="mt-2 text-muted-foreground">
              The privacy you get here comes from open code, not promises. This
              deployment runs source{" "}
              <a
                className="font-mono underline underline-offset-4"
                href={info.commitUrl}
                target="_blank"
                rel="noreferrer"
              >
                {info.commit.slice(0, 12)}
              </a>
              , published {info.commitTime.slice(0, 10)} — public for anyone to
              audit. The full code is open, the dependency list is published{" "}
              <a className="underline underline-offset-4" href={info.sbom}>
                here
              </a>
              , and every file served carries a signed checksum (
              <a className="underline underline-offset-4" href={info.checksums}>
                see for yourself
              </a>
              ).
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">
              Signed, so you know it&apos;s that code
            </h2>
            <p className="mt-2 text-muted-foreground">
              Each deployment is cryptographically signed and recorded in a
              public transparency log — proof that the privacy-protecting code
              you can audit is exactly what&apos;s running here, with nothing
              quietly added.{" "}
              <a
                className="underline underline-offset-4"
                href={info.attestations}
                target="_blank"
                rel="noreferrer"
              >
                view the signatures
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Trust, verified</h2>
            <p className="mt-2 text-muted-foreground">
              The strongest proof needs no trust at all: rebuild from the public
              source and compare. Matching hashes mean this site runs exactly
              the open code that keeps your files on your device.
            </p>
            <div className="mt-4 space-y-4">
              <div>
                <p className="mb-1 text-sm font-medium">
                  1. Get the exact source
                </p>
                <Command command={info.rebuild.checkout} />
              </div>
              <div>
                <p className="mb-1 text-sm font-medium">
                  2. Rebuild it (same tools, same settings, guaranteed)
                </p>
                <Command command={info.rebuild.build} />
              </div>
              <div>
                <p className="mb-1 text-sm font-medium">
                  3. Compare with this live site
                </p>
                <Command command={info.rebuild.compare} />
              </div>
            </div>
          </section>
        </div>
      ) : (
        <p className="mt-8 text-muted-foreground">
          Build details aren&apos;t available in this environment — they ship
          with every production deployment of uncommonstash.com.
        </p>
      )}
    </div>
  );
});
