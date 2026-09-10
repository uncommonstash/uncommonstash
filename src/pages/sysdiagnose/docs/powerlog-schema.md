# Powerlog SQL schema reference

All names and SQLite types below are schema-verified from the supplied archive.
“Meaning” and “unit” describe the confidence level; a SQLite `INTEGER` is not
by itself a physical-unit declaration.

## `PLAccountingOperator_EventNone_Nodes`

Dictionary for the opaque IDs used by Powerlog accounting tables.

| Column | SQLite type | Meaning | Unit |
| --- | --- | --- | --- |
| `ID` | INTEGER, primary key | Node dictionary key. Dynamic per archive; never hard-code it. | Identifier |
| `timestamp` | REAL | Monotonic-clock time at which the node entry was written. | Seconds; wall time requires TimeOffset |
| `IsPermanent` | INTEGER | Node persistence flag. Exact enum is unknown. | Boolean-like, undocumented |
| `Name` | TEXT | Human-readable account label, e.g. `CPU`, `DisplayDynamic`, or an app bundle ID. | Text |

## `PLAccountingOperator_Aggregate_RootNodeEnergy`

Hourly and daily energy-attribution aggregates. This is the main table used by
the current direct app extraction.

| Column | SQLite type | Meaning | Unit |
| --- | --- | --- | --- |
| `ID` | INTEGER, primary key | Row key. | Identifier |
| `timestamp` | REAL | **End** of this aggregate interval. | Monotonic seconds |
| `timeInterval` | REAL | Aggregate duration. This archive has 3,600-second and 86,400-second rows. | Seconds |
| `Energy` | INTEGER | Energy attributed to the `(RootNodeID, NodeID)` pair in this interval. | **uWh, archive-validated only**; multiply by 0.001 for mWh |
| `NodeID` | INTEGER | Consumer account receiving the attribution; join to `Nodes.ID`. | Identifier |
| `RootNodeID` | INTEGER | Component/account being distributed; join to `Nodes.ID`. | Identifier |

Do not use `NodeID = RootNodeID` as a component total. It is only a root-self
row. Do not sum arbitrary rows either: whether every `NodeID` is an exclusive
recipient must be proven from the distribution records first.

## `PLStorageOperator_EventForward_TimeOffset`

| Column | SQLite type | Meaning | Unit |
| --- | --- | --- | --- |
| `ID` | INTEGER, primary key | Row key. | Identifier |
| `timestamp` | REAL | Monotonic-clock check-in used to select this offset. | Monotonic seconds |
| `baseband` | REAL | Offset from monotonic time to baseband time. | Seconds |
| `kernel` | REAL | Offset from monotonic time to kernel time. | Seconds |
| `system` | REAL | Offset from monotonic time to system/wall-clock Unix time. | Seconds |

For a record at monotonic time `t`, use the latest offset record whose
`timestamp <= t`; wall Unix seconds are `t + system`.

## `PLAccountingOperator_EventInterval_EnergyEstimateEvents`

Fine-grained estimated-energy intervals. This archive contains 113,193 rows;
durations range from 9 microseconds to about 21.6 seconds. These records are
not yet used for charting because their distribution/correction semantics have
not been validated.

| Column | SQLite type | Meaning | Unit |
| --- | --- | --- | --- |
| `ID` | INTEGER, primary key | Row key. | Identifier |
| `timestamp` | REAL | Base monotonic timestamp. | Monotonic seconds |
| `StartOffset`, `EndOffset` | INTEGER | Interval offsets from `timestamp`. | Microseconds, schema/value-verified |
| `Energy` | INTEGER | Estimated raw energy before any unverified correction handling. | Unknown raw energy unit |
| `CorrectionEnergy` | INTEGER | Correction value associated with the estimate. | Unknown raw energy unit |
| `NodeID` | INTEGER | Consumer node. | Identifier |
| `RootNodeID` | INTEGER | Component/root node. | Identifier |
| `ParentEntryID` | INTEGER | Link to another accounting entry. Exact target semantics unknown. | Identifier, undocumented |
| `TerminationRatio` | INTEGER | Estimate termination metadata. Exact scale/meaning unknown. | Unknown |

## Distribution and power event tables

These tables are the missing evidence needed to prove a device-wide component
total rather than just drawing an attribution subset.

### `PLAccountingOperator_EventInterval_PowerEvents`

| Column | SQLite type | Meaning | Unit |
| --- | --- | --- | --- |
| `ID` | INTEGER, primary key | Row key. | Identifier |
| `timestamp` | REAL | Base monotonic timestamp. | Monotonic seconds |
| `StartOffset`, `EndOffset` | INTEGER | Event interval offsets. | Microseconds |
| `Power` | INTEGER | Power estimate for `RootNodeID`. | Unknown raw power unit |
| `RootNodeID` | INTEGER | Component/root node. | Identifier |

### `PLAccountingOperator_EventInterval_DistributionEvents`

| Column | SQLite type | Meaning | Unit |
| --- | --- | --- | --- |
| `ID` | INTEGER, primary key | Row key. | Identifier |
| `timestamp` | REAL | Base monotonic timestamp. | Monotonic seconds |
| `StartOffset`, `EndOffset` | INTEGER | Event interval offsets. | Microseconds |
| `DistributionID` | INTEGER | Distribution-rule reference. | Identifier |

### `PLAccountingOperator_EventNone_DistributionRules`

| Column | SQLite type | Meaning | Unit |
| --- | --- | --- | --- |
| `ID` | INTEGER, primary key | Row key. | Identifier |
| `timestamp` | REAL | Monotonic write timestamp. | Monotonic seconds |
| `DistributionID` | INTEGER | Key referenced by distribution event rows. | Identifier |
| `NodeID` | INTEGER | Consumer node participating in a rule. | Identifier |
| `RootNodeID` | INTEGER | Component/root node for the rule. | Identifier |

## `PLAccountingOperator_Aggregate_QualificationEnergy`

| Column | SQLite type | Meaning | Unit |
| --- | --- | --- | --- |
| `ID` | INTEGER, primary key | Row key. | Identifier |
| `timestamp` | REAL | End of aggregate interval. | Monotonic seconds |
| `timeInterval` | REAL | Aggregate duration. | Seconds |
| `Energy` | INTEGER | Energy associated with a qualification and node/root pair. | Unknown raw energy unit |
| `NodeID`, `RootNodeID` | INTEGER | Consumer and component node references. | Identifier |
| `QualificationID` | INTEGER | Qualification-rule/event reference. | Identifier, undocumented |
