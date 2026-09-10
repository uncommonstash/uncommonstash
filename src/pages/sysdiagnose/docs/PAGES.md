# Sysdiagnose page research

## Contents

- [Scope and evidence rules](#scope-and-evidence-rules)
  - [Page contract](#page-contract)
  - [Privacy and availability](#privacy-and-availability)
- [WiFi](#wifi)
  - [Available artifacts](#available-artifacts)
  - [Recommended first UI](#recommended-first-ui)
  - [Interpretation limits](#interpretation-limits)
- [Storage](#storage)
  - [Available artifacts](#available-artifacts-1)
  - [Recommended first UI](#recommended-first-ui-1)
  - [Interpretation limits](#interpretation-limits-1)
- [Thermal](#thermal)
  - [Available artifacts](#available-artifacts-2)
  - [Recommended first UI](#recommended-first-ui-2)
  - [Interpretation limits](#interpretation-limits-2)
- [Device](#device)
  - [Available artifacts](#available-artifacts-3)
  - [Recommended first UI](#recommended-first-ui-3)
  - [Interpretation limits](#interpretation-limits-3)
- [Crashes](#crashes)
  - [Available artifacts](#available-artifacts-4)
  - [Recommended first UI](#recommended-first-ui-4)
  - [Interpretation limits](#interpretation-limits-4)
- [Implementation sequence](#implementation-sequence)
  - [Shared extraction primitives](#shared-extraction-primitives)

# Scope and evidence rules

Apple describes sysdiagnose as a diagnostic artifact and separately offers
special-purpose profiles for Wi-Fi and disk-space diagnostics. It does not
publish a stable schema for the files within the archive, so every parser must
be versioned and source-labelled rather than treating a file name as a public
contract. See [Apple's Profiles and Logs
catalog](https://developer.apple.com/feedback-assistant/profiles-and-logs/?name=sysdiagnose_).

The evidence below comes from a sampled sysdiagnose archive from my iPhone,
cross-checked against Apple documentation and independent forensic work.
[SAF's parser inventory](https://github.com/EC-DIGIT-CSIRC/sysdiagnose) and
[the iOS 16 sysdiagnose survey](https://blog.digital-forensics.it/2022/11/sysdiagnose-in-ios-16-first-look-from.html)
confirm that this archive family commonly contains these artifact classes, not
that each one is present or semantically identical on every iOS build.

## Page contract

Each page must name its exact source files, parse only recognized versions, and
render either the parsed records or an explicit unavailable/unsupported state.
No page may infer a historical timeline from a capture-time snapshot, invent a
unit, or diagnose a hardware fault from one log field.

| Evidence level              | UI behavior                                                                 |
| --------------------------- | --------------------------------------------------------------------------- |
| Source record with time     | Render a timestamped event or interval with its original fields.           |
| Capture-time snapshot       | Render as a snapshot and label it with the archive capture time.           |
| Parsed summary              | Preserve the original event class/reason and link to raw record detail.    |
| Missing or unknown artifact | Show unavailable; do not replace it with an empty-looking successful view. |

## Privacy and availability

WiFi artifacts can contain SSIDs, BSSIDs, IP addresses, and private network
identifiers. Device records may include serial, UDID-like, or account-related
identifiers. Crash reports can include bundle IDs, paths, and process names.
These values must stay local, be redacted in screenshots/exports by default,
and be revealed only by an explicit local action.

# WiFi

The sampled archive has a dedicated `WiFi/` directory containing connection
snapshots, scans, status text, configuration plists, and compressed Analytics
Store CSV exports for BSS, joins, leaves, roams, recovery, faults, scans,
network traits, and usage. This matches independent research identifying
`com.apple.wifi.plist`, known-network artifacts, and Wi-Fi logs as productive
sysdiagnose sources. [CoreCapture research](https://arxiv.org/abs/1808.07353)
also describes Apple’s Wi-Fi logging framework.

## Available artifacts

| Artifact family                                  | Candidate records                                                        | Evidence shape                |
| ------------------------------------------------ | ------------------------------------------------------------------------ | ----------------------------- |
| `wifi_status.txt`, `network_status.txt`          | Current association, link state, interface/network snapshot             | Capture-time snapshot         |
| `com.apple.wifi.plist` and legacy/private plists | Configured/known network metadata and privacy-address configuration     | Configuration/history         |
| `Entity_*_{Join,Leave,Roam,Recovery,Fault}.csv`  | Association lifecycle, recovery and fault records                       | Timestamped event candidates  |
| `Entity_*_{BSS,Scan,WiFiStat,MetricEntry}.csv`   | Scan/BSS observations and link/quality metrics                          | Timestamped record candidates |
| `netstat-*`, `ifconfig.txt`, `arp.txt`           | Interface, route/socket, and neighbor-table snapshots                   | Capture-time snapshots        |

## Recommended first UI

- A redacted current-connection card: association state, interface, network
  type, and the capture timestamp.
- A connection timeline from recognized Join, Leave, Roam, Recovery, and Fault
  rows; use the CSV's own timestamp only after its epoch/format is validated.
- A network table with SSID/BSSID masked by default, event counts, last-seen
  time, and drill-down to the original record.
- A quality panel only for named, validated metric fields; display their source
  field and unit instead of turning undocumented counters into signal bars.

## Interpretation limits

Do not claim that a scanned BSSID was connected to, that an SSID identifies a
physical location, or that a fault row proves an internet outage. Join history
and scan telemetry have different semantics. Treat pre/post network commands
as capture-time snapshots, not a time series.

# Storage

The sampled archive contains `disks.txt`, `apfs_stats.txt`,
`logs/fsck/fsck_apfs.log`, File Provider diagnostics, and resource-exhaustion
reports such as `*.diskwrites_resource.ips`. The iOS 16 forensic survey also
lists `apfs_stats.txt` among sysdiagnose artifacts, while Apple separately
offers a Disk Space Diagnostics profile. [Apple's catalog](https://developer.apple.com/feedback-assistant/profiles-and-logs/?name=sysdiagnose_)
and [the iOS 16 survey](https://blog.digital-forensics.it/2022/11/sysdiagnose-in-ios-16-first-look-from.html)
support this as a storage-diagnostics surface.

## Available artifacts

| Artifact family                     | Candidate records                                                        | Evidence shape             |
| ----------------------------------- | ------------------------------------------------------------------------ | -------------------------- |
| `disks.txt`                         | Mounted volumes, total/used/available capacity, filesystem identifiers  | Capture-time snapshot      |
| `apfs_stats.txt`                    | APFS statistics/counters                                                 | Capture-time snapshot      |
| `logs/fsck/fsck_apfs.log`           | File-system check messages and outcome                                   | Log/event evidence         |
| `*.diskwrites_resource.ips`         | Resource-exhaustion report naming a process and disk-write event         | Timestamped diagnostic     |
| File Provider diagnostics           | Local File Provider operational state                                    | Service diagnostics        |

## Recommended first UI

- A volume table with total, used, available, capacity percentage, mount point,
  and the source capture time.
- A filesystem-health section that presents `fsck_apfs` result text verbatim
  with status classification only after the exact result grammar is validated.
- A write-pressure event list from recognized `diskwrites_resource` reports:
  incident time, process, and report type, with raw IPS detail.
- An APFS counters panel that initially exposes raw names and values; promote a
  counter to a chart only after sampling proves a unit and direction.

## Interpretation limits

The volume table reports free space at capture, not historical consumption.
APFS counters and File Provider output are private implementation details;
never label them as NAND wear, storage health, or corruption without a source
field that actually supports that conclusion.

# Thermal

The sampled archive's `ThermalLogs.log` summary requests the usual thermal
graph source but records that its expected `tgraph.csv` was absent. The archive
does have `ioreg/IOPower.txt`, powerlog data, unified logs, and crash reports,
which can provide related evidence but are not interchangeable with a thermal
temperature series.

## Available artifacts

| Artifact family                    | Candidate records                                                        | Evidence shape                    |
| ---------------------------------- | ------------------------------------------------------------------------ | --------------------------------- |
| `tgraph.csv` when present          | Thermal graph samples/fields requiring schema validation                | Potential timestamped telemetry   |
| `summaries/ThermalLogs.log`        | Whether the thermal collector found/filtered a source                   | Capture-generation summary        |
| Unified logs                       | `thermalmonitord` state, warnings, and policy transitions               | Timestamped log candidates        |
| `ioreg/IOPower.txt`                | Power-management service tree/state                                      | Capture-time snapshot             |
| Panic/crash reports                | Thermal-monitor/watchdog text when explicitly recorded                  | Timestamped related diagnostics   |

## Recommended first UI

- An availability card identifying the exact thermal source found, or clearly
  stating that no validated thermal time series exists.
- If a supported `tgraph.csv` fingerprint is present: a source-labelled time
  chart of its raw fields and a record table; no temperature units until their
  semantics are validated.
- A separate, filtered event list for thermal-related unified-log records and
  crash/panic text, linked to raw detail.
- A capture-time IOPower snapshot for context, visually distinct from the
  timeline.

## Interpretation limits

Thermal state, temperature, performance throttling, and hardware sensor health
are distinct claims. A `thermalmonitord` mention in a panic is diagnostic
context, not proof of a failed sensor or an overheating root cause. In the
sampled archive, the missing graph source means the first implementation should
show availability—not synthesize a thermal chart from power usage.

# Device

The sampled archive has `logs/SystemVersion/SystemVersion.plist`, `sysctl.txt`,
`ioreg/IOService.txt`, `ioreg/IODeviceTree.txt`, `IOReg.xml`, IOPower/IOUSB
snapshots, and a proxied-device metadata artifact. Independent sysdiagnose
research also uses `SystemVersion.plist` for OS version/build and I/O Registry
artifacts for device properties; see [the primer](https://ismyapppwned.com/2024/08/01/ios_device_forensics_sysdiagnose/)
and [extractor-library inventory](https://github.com/IsMyPhonePwned/sysdiagnose-extractor-library).

## Available artifacts

| Artifact family                        | Candidate records                                                         | Evidence shape        |
| -------------------------------------- | ------------------------------------------------------------------------- | --------------------- |
| `SystemVersion.plist`                  | Product version, build, system image/version fields                       | Capture-time snapshot |
| `sysctl.txt`                           | Kernel/OS and hardware runtime values                                     | Capture-time snapshot |
| `ioreg/IOService.txt`, `IODeviceTree`  | I/O Registry service and device-tree properties                           | Capture-time snapshot |
| `IOReg.xml`, `IOPower.txt`, `IOUSB.txt`| Structured registry, power, and USB snapshots                             | Capture-time snapshot |
| Proxied device metadata                | Device/service metadata where present                                     | Capture-time snapshot |

## Recommended first UI

- A concise identity card: product type/name, OS version, build, and capture
  time; unknown values stay unknown rather than being mapped by a hard-coded
  device database.
- Expandable hardware and operating-system sections sourced directly from
  SystemVersion, sysctl, and I/O Registry records.
- A separate power/USB snapshot panel that states it is a capture-time view.
- A local-only sensitive-identifiers disclosure with redaction on by default.

## Interpretation limits

Device inventory is a snapshot. It cannot establish historical attachment,
repair, ownership, or security posture. Product-name mappings and private I/O
Registry keys must be treated as versioned parser data, not universal API
contracts.

# Crashes

The sampled archive includes `crashes_and_spins/` reports for Jetsam events,
CPU and disk-write resource exceptions, diagnostic stacks, and app/service
reports, plus a crash summary. It has no matching `panic-*.ips` candidate in
the collector summary. Apple documents that modern `.ips` crash reports are
JSON-based and that Jetsam reports describe memory-pressure termination.
[Apple's IPS format reference](https://developer.apple.com/documentation/xcode/interpreting-the-json-format-of-a-crash-report)
and [Jetsam guidance](https://developer.apple.com/documentation/xcode/identifying-high-memory-use-with-jetsam-event-reports?language=objc)
are the primary interpretation boundaries.

## Available artifacts

| Artifact family                      | Candidate records                                                          | Evidence shape              |
| ------------------------------------ | -------------------------------------------------------------------------- | --------------------------- |
| `crashes_and_spins/*.ips`            | App/service crashes, resource exceptions, Jetsam reports, stack captures  | Timestamped diagnostic      |
| `JetsamEvent-*.ips`                  | Memory-pressure termination record                                         | Timestamped diagnostic      |
| `*.cpu_resource.ips`                 | CPU resource-exception record                                              | Timestamped diagnostic      |
| `*.diskwrites_resource.ips`          | Disk-write resource-exception record                                       | Timestamped diagnostic      |
| `panic-*.ips` when present           | Kernel panic report                                                        | Timestamped diagnostic      |
| `summaries/crashes_and_spins.log`    | Collector-selected report inventory                                        | Archive summary             |

## Recommended first UI

- A chronologically sorted event table with incident time, report class,
  process/bundle, termination/exception reason, and a raw detail sheet.
- Facets for app crash, Jetsam, CPU resource, disk-write resource, panic, and
  unclassified reports; classification must come from the report's own fields
  or a conservative filename family.
- A duplicate/group view that preserves every original report and explains the
  grouping key.
- A local-only raw JSON/text viewer with identifier/path redaction controls.

## Interpretation limits

Jetsam is an OS memory-pressure termination, not necessarily an application
crash; Apple explicitly distinguishes the two. Resource-exception and panic
reports are evidence of a reported condition, not a root-cause diagnosis. A
missing panic file must render as no captured panic report, never as proof that
the device did not reboot.

# Implementation sequence

## Shared extraction primitives

1. Build a versioned archive catalog with path, size, text/binary kind, and a
   parser capability state; the scaffolded tabs should use this rather than
   searching arbitrary text on the main thread.
2. Add bounded, local-only readers for plist, text, CSV/TGZ, and IPS JSON with
   archive-relative path allowlists and explicit size limits.
3. Establish a shared record envelope: source path, source-local timestamp,
   normalized timestamp only when the format is known, raw fields, parser
   fingerprint, and diagnostic reason.
4. Implement Crashes and Device first because the source shapes are explicit
   snapshots/IPS records. Implement WiFi next with a small supported CSV
   subset. Implement Storage and Thermal only after each raw field's semantics
   are sampled and documented.
