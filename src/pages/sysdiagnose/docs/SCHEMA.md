# Conceptual framework

## Contents

- [Conceptual framework](#conceptual-framework)
  - [Archive scope and evidence](#archive-scope-and-evidence)
  - [Powerlog ontology](#powerlog-ontology)
  - [Time model](#time-model)
- [Powerlog core tables](#powerlog-core-tables)
  - [`PLAccountingOperator_EventNone_Nodes`](#placcountingoperator_eventnone_nodes)
  - [`PLAccountingOperator_Aggregate_RootNodeEnergy`](#placcountingoperator_aggregate_rootnodeenergy)
  - [`PLStorageOperator_EventForward_TimeOffset`](#plstorageoperator_eventforward_timeoffset)
  - [`PLAccountingOperator_EventInterval_EnergyEstimateEvents`](#placcountingoperator_eventinterval_energyestimateevents)
  - [`PLAccountingOperator_Aggregate_QualificationEnergy`](#placcountingoperator_aggregate_qualificationenergy)
- [Distribution and power event tables](#distribution-and-power-event-tables)
  - [`PLAccountingOperator_EventInterval_PowerEvents`](#placcountingoperator_eventinterval_powerevents)
  - [`PLAccountingOperator_EventInterval_DistributionEvents`](#placcountingoperator_eventinterval_distributionevents)
  - [`PLAccountingOperator_EventNone_DistributionRules`](#placcountingoperator_eventnone_distributionrules)
- [App activity and battery tables](#app-activity-and-battery-tables)
  - [`PLAppTimeService_Aggregate_AppRunTime`](#plapptimeservice_aggregate_appruntime)
  - [`PLCoalitionAgent_EventInterval_CoalitionInterval`](#plcoalitionagent_eventinterval_coalitioninterval)
  - [`PLBatteryAgent_EventBackward_Battery`](#plbatteryagent_eventbackward_battery)
  - [Practical source hierarchy](#practical-source-hierarchy)

## Archive scope and evidence

Apple documents sysdiagnose as a diagnostic artifact for Feedback Assistant,
but does not publish a schema or unit contract for the private `*.PLSQL`
databases it may contain. See [Apple's Profiles and
Logs](https://developer.apple.com/feedback-assistant/profiles-and-logs/?name=sysdiagnose_)
and its [debug logging overview](https://developer.apple.com/news/?id=2o2p68bq).
This is therefore a versioned forensic artifact, not an Apple SDK database.

All names and SQLite types below were read from a sampled sysdiagnose archive
from my iPhone. “Meaning” and “unit” report the confidence of the
interpretation; a SQLite `INTEGER` is not, by itself, a physical-unit
declaration.

| Label                       | Meaning                                                                                                                                     |
| ---                         | ---                                                                                                                                         |
| **Schema-verified**         | SQLite DDL, column type, or value relationship observed in this archive.                                                                    |
| **Archive-validated**       | Independently checked against another artifact in this archive.                                                                             |
| **Forensic interpretation** | Supported by cited reverse-engineering work; not an Apple API guarantee.                                                                    |
| **Unknown**                 | The database exposes the field but neither the archive nor available research gives it a reliable meaning/unit. The UI must not invent one. |

## Powerlog ontology

```text
sysdiagnose archive
  └─ Powerlog SQLite database (`*.PLSQL`)
       ├─ dictionary records: dynamic node IDs → names
       ├─ calibration records: monotonic time → wall-clock offset
       ├─ interval/event records: a raw measurement over a time span
       └─ aggregate records: a roll-up over a completed time interval
```

A **node** is a dynamically assigned account in Powerlog's internal accounting
graph. A node can name an app bundle, a service, a hardware component, or a
system bucket; its numeric `ID` has no cross-archive meaning. An attribution
record connects `RootNodeID` (the component/account being distributed) to
`NodeID` (the consumer credited under it) with an energy value. Earlier
independent research also describes the node dictionary plus hourly
`RootNodeEnergy` records as app-by-hardware attribution; see [Punmy's Power Log
analysis](https://punmy.cn/2018/06/12/iOS%20%E6%9C%80%E5%85%A8%E9%9D%A2%E7%9A%84%E5%8A%9F%E8%80%97%E5%88%86%E6%9E%90%E4%B9%8B%E2%80%94%E2%80%94Power%20Log/).

This means `PLAccountingOperator_Aggregate_RootNodeEnergy` is an
**attribution matrix**, not an already-computed device component chart:

```text
RootNodeID = component being accounted for  (CPU, DisplayDynamic, DRAM, ...)
NodeID     = consumer credited under it     (an app, service, or system bucket)
Energy     = component → consumer attribution for an aggregate interval
```

`NodeID = RootNodeID` selects the root's own allocation. It is **not** the sum
of all consumers under that component. In the captured archive's final hour,
root-self entries totalled 9.4 mWh while all rows totalled 247.1 mWh. The exact
device-wide aggregation rule still requires validation against the
distribution/qualification records before the UI can call a component chart a
total.

## Time model

Powerlog `timestamp` values are monotonic-clock seconds, not wall-clock Unix
seconds. To render an event at wall time, select the TimeOffset record with the
greatest `TimeOffset.timestamp` less than or equal to the event timestamp, then
add `TimeOffset.system`. This per-event rule is supported by [Ian Whiffin's
Powerlog timing research](https://doubleblak.com/blogPost.php?k=powerlog).
[Mac4n6](https://www.mac4n6.com/blog/2018/12/16/on-the-third-day-of-apollo-my-true-love-gave-to-me-application-usage-to-determine-who-has-been-naughty-or-nice)
also documents offsets and version differences; [DFRWS](https://dfrws.org/presentation/time_well_spent/)
is dedicated to Powerlog timing and monotonic clocks.

For an end-stamped hourly aggregate:

```text
raw start = Aggregate.timestamp - Aggregate.timeInterval
raw end   = Aggregate.timestamp
wall endpoint = raw endpoint + TimeOffset.system_at_that_endpoint
```

# Powerlog core tables

## `PLAccountingOperator_EventNone_Nodes`

Dictionary for the opaque IDs used by Powerlog accounting tables.

| Column        | SQLite type          | Meaning                                                                          | Unit                                   |
| ---           | ---                  | ---                                                                              | ---                                    |
| `ID`          | INTEGER, primary key | Node dictionary key. Dynamic per archive; never hard-code it.                    | Identifier                             |
| `timestamp`   | REAL                 | Monotonic-clock time at which the node entry was written.                        | Seconds; wall time requires TimeOffset |
| `IsPermanent` | INTEGER              | Node persistence flag. Exact enum is unknown.                                    | Boolean-like, undocumented             |
| `Name`        | TEXT                 | Human-readable account label, e.g. `CPU`, `DisplayDynamic`, or an app bundle ID. | Text                                   |

## `PLAccountingOperator_Aggregate_RootNodeEnergy`

Hourly and daily energy-attribution aggregates. This is the main table used by
the current direct app extraction.

| Column         | SQLite type          | Meaning                                                                   | Unit                                                       |
| ---            | ---                  | ---                                                                       | ---                                                        |
| `ID`           | INTEGER, primary key | Row key.                                                                  | Identifier                                                 |
| `timestamp`    | REAL                 | **End** of this aggregate interval.                                       | Monotonic seconds                                          |
| `timeInterval` | REAL                 | Aggregate duration. This archive has 3,600-second and 86,400-second rows. | Seconds                                                    |
| `Energy`       | INTEGER              | Energy attributed to the `(RootNodeID, NodeID)` pair in this interval.    | **uWh, archive-validated only**; multiply by 0.001 for mWh |
| `NodeID`       | INTEGER              | Consumer account receiving the attribution; join to `Nodes.ID`.           | Identifier                                                 |
| `RootNodeID`   | INTEGER              | Component/account being distributed; join to `Nodes.ID`.                  | Identifier                                                 |

Do not use `NodeID = RootNodeID` as a component total. It is only a root-self
row. Do not sum arbitrary rows either: whether every `NodeID` is an exclusive
recipient must be proven from the distribution records first.

## `PLStorageOperator_EventForward_TimeOffset`

| Column      | SQLite type          | Meaning                                                    | Unit              |
| ---         | ---                  | ---                                                        | ---               |
| `ID`        | INTEGER, primary key | Row key.                                                   | Identifier        |
| `timestamp` | REAL                 | Monotonic-clock check-in used to select this offset.       | Monotonic seconds |
| `baseband`  | REAL                 | Offset from monotonic time to baseband time.               | Seconds           |
| `kernel`    | REAL                 | Offset from monotonic time to kernel time.                 | Seconds           |
| `system`    | REAL                 | Offset from monotonic time to system/wall-clock Unix time. | Seconds           |

For a record at monotonic time `t`, use the latest offset record whose
`timestamp <= t`; wall Unix seconds are `t + system`. This is the same
per-record selection rule demonstrated in [Whiffin's Powerlog timing
research](https://doubleblak.com/blogPost.php?k=powerlog); a global database
offset is not valid.

## `PLAccountingOperator_EventInterval_EnergyEstimateEvents`

Fine-grained estimated-energy intervals. This archive contains 113,193 rows;
durations range from 9 microseconds to about 21.6 seconds. These records are
not yet used for charting because their distribution/correction semantics have
not been validated.

| Column                     | SQLite type          | Meaning                                                           | Unit                                |
| ---                        | ---                  | ---                                                               | ---                                 |
| `ID`                       | INTEGER, primary key | Row key.                                                          | Identifier                          |
| `timestamp`                | REAL                 | Base monotonic timestamp.                                         | Monotonic seconds                   |
| `StartOffset`, `EndOffset` | INTEGER              | Interval offsets from `timestamp`.                                | Microseconds, schema/value-verified |
| `Energy`                   | INTEGER              | Estimated raw energy before any unverified correction handling.   | Unknown raw energy unit             |
| `CorrectionEnergy`         | INTEGER              | Correction value associated with the estimate.                    | Unknown raw energy unit             |
| `NodeID`                   | INTEGER              | Consumer node.                                                    | Identifier                          |
| `RootNodeID`               | INTEGER              | Component/root node.                                              | Identifier                          |
| `ParentEntryID`            | INTEGER              | Link to another accounting entry. Exact target semantics unknown. | Identifier, undocumented            |
| `TerminationRatio`         | INTEGER              | Estimate termination metadata. Exact scale/meaning unknown.       | Unknown                             |

# Distribution and power event tables

These tables are the missing evidence needed to prove a device-wide component
total rather than just drawing an attribution subset.

## `PLAccountingOperator_EventInterval_PowerEvents`

| Column                     | SQLite type          | Meaning                          | Unit                   |
| ---                        | ---                  | ---                              | ---                    |
| `ID`                       | INTEGER, primary key | Row key.                         | Identifier             |
| `timestamp`                | REAL                 | Base monotonic timestamp.        | Monotonic seconds      |
| `StartOffset`, `EndOffset` | INTEGER              | Event interval offsets.          | Microseconds           |
| `Power`                    | INTEGER              | Power estimate for `RootNodeID`. | Unknown raw power unit |
| `RootNodeID`               | INTEGER              | Component/root node.             | Identifier             |

## `PLAccountingOperator_EventInterval_DistributionEvents`

| Column                     | SQLite type          | Meaning                      | Unit              |
| ---                        | ---                  | ---                          | ---               |
| `ID`                       | INTEGER, primary key | Row key.                     | Identifier        |
| `timestamp`                | REAL                 | Base monotonic timestamp.    | Monotonic seconds |
| `StartOffset`, `EndOffset` | INTEGER              | Event interval offsets.      | Microseconds      |
| `DistributionID`           | INTEGER              | Distribution-rule reference. | Identifier        |

## `PLAccountingOperator_EventNone_DistributionRules`

| Column           | SQLite type          | Meaning                                    | Unit              |
| ---              | ---                  | ---                                        | ---               |
| `ID`             | INTEGER, primary key | Row key.                                   | Identifier        |
| `timestamp`      | REAL                 | Monotonic write timestamp.                 | Monotonic seconds |
| `DistributionID` | INTEGER              | Key referenced by distribution event rows. | Identifier        |
| `NodeID`         | INTEGER              | Consumer node participating in a rule.     | Identifier        |
| `RootNodeID`     | INTEGER              | Component/root node for the rule.          | Identifier        |

## `PLAccountingOperator_Aggregate_QualificationEnergy`

| Column                 | SQLite type          | Meaning                                                    | Unit                     |
| ---                    | ---                  | ---                                                        | ---                      |
| `ID`                   | INTEGER, primary key | Row key.                                                   | Identifier               |
| `timestamp`            | REAL                 | End of aggregate interval.                                 | Monotonic seconds        |
| `timeInterval`         | REAL                 | Aggregate duration.                                        | Seconds                  |
| `Energy`               | INTEGER              | Energy associated with a qualification and node/root pair. | Unknown raw energy unit  |
| `NodeID`, `RootNodeID` | INTEGER              | Consumer and component node references.                    | Identifier               |
| `QualificationID`      | INTEGER              | Qualification-rule/event reference.                        | Identifier, undocumented |

# App activity and battery tables

## `PLAppTimeService_Aggregate_AppRunTime`

Hourly app-runtime aggregates. The app table uses these for time columns, not
for energy.

| Column                                                                                                                 | SQLite type          | Meaning                                                                                                                            | Unit                                        |
| ---                                                                                                                    | ---                  | ---                                                                                                                                | ---                                         |
| `ID`                                                                                                                   | INTEGER, primary key | Row key.                                                                                                                           | Identifier                                  |
| `timestamp`                                                                                                            | REAL                 | End of the aggregate interval.                                                                                                     | Monotonic seconds                           |
| `timeInterval`                                                                                                         | REAL                 | Aggregate duration.                                                                                                                | Seconds                                     |
| `BundleID`                                                                                                             | TEXT                 | App bundle identifier.                                                                                                             | Text                                        |
| `ScreenOnTime`                                                                                                         | REAL                 | App runtime while screen was on.                                                                                                   | Seconds                                     |
| `BackgroundTime`                                                                                                       | REAL                 | App runtime reported as background.                                                                                                | Seconds                                     |
| `ScreenOnPluggedInTime`                                                                                                | REAL                 | Subset of screen-on time while externally powered. Do not add to `ScreenOnTime`.                                                   | Seconds                                     |
| `BackgroundPluggedInTime`                                                                                              | REAL                 | Subset of background time while externally powered. Do not add to `BackgroundTime`.                                                | Seconds                                     |
| `BackgroundAudioNowPlayingTime`, `BackgroundAudioPlayingTime`, `BackgroundLocationAudioTime`, `BackgroundLocationTime` | REAL                 | More specific background-runtime categories. Relationship to `BackgroundTime` is version-dependent; do not sum without validation. | Seconds                                     |
| Corresponding `*PluggedInTime` fields                                                                                  | REAL                 | Externally powered subsets of those categories.                                                                                    | Seconds                                     |
| `InCallBackgroundTime`, `InCallScreenOnTime`                                                                           | INTEGER              | Call-related runtime categories. Exact inclusion relationship is undocumented.                                                     | Likely seconds; not independently validated |

## `PLCoalitionAgent_EventInterval_CoalitionInterval`

Per-coalition/process accounting. It is useful corroboration but its `energy`
column must not be presented as calibrated mWh without an archive-specific unit
validation.

| Column group                                                                  | Meaning                                | Unit/status                                              |
| ---                                                                           | ---                                    | ---                                                      |
| `ID`, `LaunchdCoalitionId`                                                    | Row and launchd coalition identifiers. | Identifier                                               |
| `timestamp`, `timestampEnd`                                                   | Interval boundaries.                   | Monotonic seconds                                        |
| `BundleId`, `LaunchdName`                                                     | App/service attribution keys.          | Text                                                     |
| `energy`, `energy_billed_to_me`, `energy_billed_to_others`                    | Coalition energy counters.             | Unknown raw energy unit                                  |
| `ane_energy_nj`, `gpu_energy_nj*`                                             | Explicitly named nanojoule counters.   | nJ                                                       |
| `cpu_time*`, `gpu_time`, `ane_time`, `time_nonempty`                          | CPU/GPU/ANE and nonempty durations.    | Seconds                                                  |
| `cpu_cycles`, `cpu_instructions`, `cpu_pcycles`, `cpu_pinstructions`          | Processor counter values.              | Counts                                                   |
| `bytesread`, `byteswritten`, `logical_*_writes`                               | I/O counters.                          | Bytes/counters; exact write semantics are field-specific |
| `interrupt_wakeups`, `platform_idle_wakeups`, `tasks_started`, `tasks_exited` | Activity counters.                     | Counts                                                   |

## `PLBatteryAgent_EventBackward_Battery`

Hardware-gauge snapshots. This archive has the following high-confidence fields:

| Column                                                                                 | Meaning                      | Unit/status                                                                                       |
| ---                                                                                    | ---                          | ---                                                                                               |
| `timestamp`                                                                            | Snapshot time.               | Monotonic seconds; apply TimeOffset                                                               |
| `Level`, `RawLevel`, `AbsoluteLevel`                                                   | Battery-level readings.      | Percent-like values; `Level` is the UI percentage in this archive                                 |
| `Voltage`, `AppleRawBatteryVoltage`, `AdapterVoltage`                                  | Voltage readings.            | Observed as millivolts; not publicly documented                                                   |
| `Amperage`, `InstantAmperage`, `AverageAmperage`, `FilteredCurrent`, `ChargingCurrent` | Current readings.            | Observed as milliamps; not publicly documented                                                    |
| `DesignCapacity`                                                                       | Designed battery capacity.   | Observed as mAh (3,544 in this archive); not publicly documented                                  |
| `CurrentCapacity`, `MaxCapacity`, `FullAvailableCapacity`                              | Gauge capacity readings.     | Exact scale is version/device-dependent; do not assume mAh. `MaxCapacity` is 100 in this archive. |
| `Temperature`, `VirtualTemperature`                                                    | Battery temperatures.        | Exact scale unknown; do not assume Celsius                                                        |
| `IsCharging`, `FullyCharged`, `ExternalConnected`, `AtCriticalLevel`                   | Battery/charger state flags. | Boolean-like                                                                                      |
| `ChargeStatus`                                                                         | Human-readable charge state. | Text                                                                                              |
| `CycleCount`                                                                           | Battery cycle counter.       | Count                                                                                             |

The table has many additional PMU/charger/health diagnostic registers
(`DOD*`, `Qmax*`, `Ra*`, `OCV*`, `Charger*`, `Port*`, `KioskMode*`, etc.).
Their names and SQLite types are observable, but their exact interpretation and
unit scales are undocumented. They must remain raw diagnostic fields until a
version-specific source or physical validation establishes a contract.

## Practical source hierarchy

| Question                       | Best current source                                 | Do not substitute              |
| ---                            | ---                                                 | ---                            |
| Battery percentage curve       | Battery UI plist / Battery snapshot `Level`         | RootNodeEnergy                 |
| Direct app energy attribution  | RootNodeEnergy rows for that app node               | Coalition `energy` raw counter |
| App foreground/background time | AppRunTime aggregate                                | Energy records                 |
| Device-wide component total    | Not yet validated; requires distribution-rule audit | Root-self rows                 |
