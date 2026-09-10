# App activity and battery SQL schema

These tables are related evidence, not interchangeable energy sources.

## `PLAppTimeService_Aggregate_AppRunTime`

Hourly app-runtime aggregates. The app table uses these for time columns, not
for energy.

| Column | SQLite type | Meaning | Unit |
| --- | --- | --- | --- |
| `ID` | INTEGER, primary key | Row key. | Identifier |
| `timestamp` | REAL | End of the aggregate interval. | Monotonic seconds |
| `timeInterval` | REAL | Aggregate duration. | Seconds |
| `BundleID` | TEXT | App bundle identifier. | Text |
| `ScreenOnTime` | REAL | App runtime while screen was on. | Seconds |
| `BackgroundTime` | REAL | App runtime reported as background. | Seconds |
| `ScreenOnPluggedInTime` | REAL | Subset of screen-on time while externally powered. Do not add to `ScreenOnTime`. | Seconds |
| `BackgroundPluggedInTime` | REAL | Subset of background time while externally powered. Do not add to `BackgroundTime`. | Seconds |
| `BackgroundAudioNowPlayingTime`, `BackgroundAudioPlayingTime`, `BackgroundLocationAudioTime`, `BackgroundLocationTime` | REAL | More specific background-runtime categories. Relationship to `BackgroundTime` is version-dependent; do not sum without validation. | Seconds |
| Corresponding `*PluggedInTime` fields | REAL | Externally powered subsets of those categories. | Seconds |
| `InCallBackgroundTime`, `InCallScreenOnTime` | INTEGER | Call-related runtime categories. Exact inclusion relationship is undocumented. | Likely seconds; not independently validated |

## `PLCoalitionAgent_EventInterval_CoalitionInterval`

Per-coalition/process accounting. It is useful corroboration but its `energy`
column must not be presented as calibrated mWh without an archive-specific unit
validation.

| Column group | Meaning | Unit/status |
| --- | --- | --- |
| `ID`, `LaunchdCoalitionId` | Row and launchd coalition identifiers. | Identifier |
| `timestamp`, `timestampEnd` | Interval boundaries. | Monotonic seconds |
| `BundleId`, `LaunchdName` | App/service attribution keys. | Text |
| `energy`, `energy_billed_to_me`, `energy_billed_to_others` | Coalition energy counters. | Unknown raw energy unit |
| `ane_energy_nj`, `gpu_energy_nj*` | Explicitly named nanojoule counters. | nJ |
| `cpu_time*`, `gpu_time`, `ane_time`, `time_nonempty` | CPU/GPU/ANE and nonempty durations. | Seconds |
| `cpu_cycles`, `cpu_instructions`, `cpu_pcycles`, `cpu_pinstructions` | Processor counter values. | Counts |
| `bytesread`, `byteswritten`, `logical_*_writes` | I/O counters. | Bytes/counters; exact write semantics are field-specific |
| `interrupt_wakeups`, `platform_idle_wakeups`, `tasks_started`, `tasks_exited` | Activity counters. | Counts |

## `PLBatteryAgent_EventBackward_Battery`

Hardware-gauge snapshots. This archive has the following high-confidence fields:

| Column | SQLite type | Meaning | Unit/status |
| --- | --- | --- | --- |
| `timestamp` | REAL | Snapshot time. | Monotonic seconds; apply TimeOffset |
| `Level`, `RawLevel`, `AbsoluteLevel` | Battery-level readings. | Percent-like values; `Level` is the UI percentage in this archive |
| `Voltage`, `AppleRawBatteryVoltage`, `AdapterVoltage` | Voltage readings. | Observed as millivolts; not publicly documented |
| `Amperage`, `InstantAmperage`, `AverageAmperage`, `FilteredCurrent`, `ChargingCurrent` | Current readings. | Observed as milliamps; not publicly documented |
| `DesignCapacity` | Designed battery capacity. | Observed as mAh (3,544 in this archive); not publicly documented |
| `CurrentCapacity`, `MaxCapacity`, `FullAvailableCapacity` | Gauge capacity readings. | Exact scale is version/device-dependent; do not assume mAh. `MaxCapacity` is 100 in this archive. |
| `Temperature`, `VirtualTemperature` | Battery temperatures. | Exact scale unknown; do not assume Celsius |
| `IsCharging`, `FullyCharged`, `ExternalConnected`, `AtCriticalLevel` | Battery/charger state flags. | Boolean-like |
| `ChargeStatus` | Human-readable charge state. | Text |
| `CycleCount` | Battery cycle counter. | Count |

The table has many additional PMU/charger/health diagnostic registers
(`DOD*`, `Qmax*`, `Ra*`, `OCV*`, `Charger*`, `Port*`, `KioskMode*`, etc.).
Their names and SQLite types are observable, but their exact interpretation and
unit scales are undocumented. They must remain raw diagnostic fields until a
version-specific source or physical validation establishes a contract.

## Practical source hierarchy

| Question | Best current source | Do not substitute |
| --- | --- | --- |
| Battery percentage curve | Battery UI plist / Battery snapshot `Level` | RootNodeEnergy |
| Direct app energy attribution | RootNodeEnergy rows for that app node | Coalition `energy` raw counter |
| App foreground/background time | AppRunTime aggregate | Energy records |
| Device-wide component total | Not yet validated; requires distribution-rule audit | Root-self rows |
