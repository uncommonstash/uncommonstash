import { useEffect, useState } from "react";
import { BackLink } from "@/components/back-link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

function Command({ label, command }: { label: string; command: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <p className="text-sm font-medium mb-1">{label}</p>
      <div className="relative">
        <pre className="text-xs bg-muted p-3 pr-16 rounded-md overflow-x-auto whitespace-pre-wrap break-all">
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
    </div>
  );
}

export default csr(function VerifyPage() {
  const [info, setInfo] = useState<BuildInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/build-info.json")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: BuildInfo) => setInfo(data))
      .catch(() => {
        setError(
          "No build info found (development build?). Deployments from main always ship /build-info.json.",
        );
      });
  }, []);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <BackLink to="/" label="Back to home" />
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Verify this deployment
        </h1>
        <p className="text-muted-foreground mt-2">
          Don&apos;t trust us — check. This page names the exact source commit
          this deployment was built from and how to rebuild it byte-for-byte.
        </p>
      </div>

      {error && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      )}

      {info && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>What you&apos;re running</CardTitle>
              <CardDescription>
                Generated at build time, covered by the signed checksums.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>
                <span className="font-medium">Commit: </span>
                <a
                  className="underline underline-offset-4 font-mono break-all"
                  href={info.commitUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  {info.commit}
                </a>
              </p>
              <p>
                <span className="font-medium">Committed: </span>
                {info.commitTime}
              </p>
              <p className="pt-2 font-medium">Independent evidence:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>
                  <a
                    className="underline underline-offset-4"
                    href={info.checksums}
                  >
                    sha256sums.txt
                  </a>{" "}
                  — hashes of every served file
                </li>
                <li>
                  <a className="underline underline-offset-4" href={info.sbom}>
                    sbom.cyclonedx.json
                  </a>{" "}
                  — dependency inventory
                </li>
                <li>
                  <a
                    className="underline underline-offset-4"
                    href={info.attestations}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Sigstore attestations
                  </a>{" "}
                  — signed build provenance (verify with{" "}
                  <code className="text-xs bg-muted px-1 rounded">
                    gh attestation verify
                  </code>
                  )
                </li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Rebuild it yourself</CardTitle>
              <CardDescription>
                If the hashes match, this page provably runs the open-source
                code. If not, please file an issue.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Command
                label="1. Check out the exact commit"
                command={info.rebuild.checkout}
              />
              <Command
                label="2. Rebuild (pinned deps, pinned clock)"
                command={info.rebuild.build}
              />
              <Command
                label="3. Compare with what this site serves"
                command={info.rebuild.compare}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>What this does not prove</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                {info.caveats.map((caveat) => (
                  <li key={caveat}>{caveat}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
});
