# Crash-report interpretation

The Crashes tab is a local browser view of `.ips` files collected under
`crashes_and_spins/`. It does not upload reports, symbolicate binaries, or make
root-cause claims.

## Supported report shapes

- Modern application crash reports: a JSON metadata object on the first line
  followed by a JSON report object. The tab uses `captureTime`, `procName`,
  `bundleInfo`, `exception`, and `termination` when present.
- Jetsam event reports: JSON report fields including `memoryStatus` and
  `processes`. The process with a `reason` is displayed as the jettisoned
  process. Memory is calculated only when both `rpages` and `pageSize` are
  present.
- Resource reports: JSON metadata followed by translated text. CPU and
  disk-write classes use their conservative filename families when the report
  does not provide structured resource fields.
- Panic reports: a `panicString` field or a conservative `panic-` filename.
- Diagnostic stacks and unknown telemetry: retained as unclassified reports;
  they are never labeled as application crashes merely because they have an
  `.ips` extension.

Malformed reports remain inspectable as raw text. Their timestamp falls back
from report fields to the filename and finally archive mtime.

## Classification and groups

Structured report fields take precedence over filename families. The supported
classes are app crash, Jetsam, CPU resource, disk-write resource, panic, and
unclassified.

Groups are recurrence navigation, never deduplication. They preserve all
source reports and state their key:

- Jetsam: class, jettisoned process, and Jetsam reason.
- App crashes: class, bundle or process, exception type, termination namespace,
  and termination code.
- Resource reports: class, bundle or process, and resource family.
- Panic and unclassified reports: class plus a stable report identity.

## Interpretation limits

Apple documents that an IPS crash report has two JSON objects and that Jetsam
records system memory pressure rather than a conventional app crash:

- [Interpreting the JSON format of a crash report](https://developer.apple.com/documentation/xcode/interpreting-the-json-format-of-a-crash-report)
- [Identifying high-memory use with Jetsam event reports](https://developer.apple.com/documentation/xcode/identifying-high-memory-use-with-jetsam-event-reports)

Jetsam is an OS memory-pressure termination, not necessarily an app crash.
Resource-exception and panic reports are evidence of a reported condition, not
a root-cause diagnosis. An archive without a panic report means only that no
panic was captured in that archive; it does not establish that the device did
not reboot.
