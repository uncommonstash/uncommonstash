# Powerlog schema notes

This directory documents the Powerlog tables relevant to Sysdiagnose's energy
analysis. It is intentionally evidence-first: Apple does **not** publish a
stable public schema or unit contract for the private `*.PLSQL` database, and
the schema changes between iOS releases. This is therefore an exact reference
for the analysis inputs and corroborating tables examined here—not a claim to
catalogue every private table present on every iOS version.

The table definitions in [SCHEMA.md](./SCHEMA.md) were read from the supplied
Powerlog database. They are a schema snapshot, not a promise about another iOS
version. That document also records what independent forensic researchers and
Apple’s public documentation say, and—equally important—what those sources do
not prove about this archive.

## Evidence labels

| Label                       | Meaning                                                                                                                                   |
| ---                         | ---                                                                                                                                       |
| **Schema-verified**         | SQLite DDL, column type, or value relationship observed in this archive.                                                                  |
| **Archive-validated**       | Independently checked against another artifact in this archive.                                                                           |
| **Forensic interpretation** | Supported by cited reverse-engineering work; not an Apple API guarantee.                                                                  |
| **Unknown**                 | The database exposes the field but neither Apple nor the available research gives it a reliable meaning/unit. The UI must not invent one. |

## The important correction

`PLAccountingOperator_Aggregate_RootNodeEnergy` is an **attribution matrix**.
It is not a ready-made device-component chart:

```text
RootNodeID = component being accounted for  (CPU, DisplayDynamic, DRAM, ...)
NodeID     = consumer credited under it     (an app, service, or system bucket)
Energy     = that component → consumer attribution for an aggregate interval
```

`NodeID = RootNodeID` selects the root's own allocation. It is **not** the
sum of all consumers under that component. In the captured archive's final
hour, root-self entries totalled 9.4 mWh while all rows totalled 247.1 mWh.
That proves root-self rows must not be labelled device-wide component totals.

The exact device-wide aggregation rule still needs validation against the
Powerlog distribution/qualification records before this tool can label a
component chart as a total.

## Time model

Powerlog's `timestamp` values are monotonic-clock seconds, not wall-clock Unix
seconds. To render a record at wall time, select the TimeOffset record with
the greatest `TimeOffset.timestamp` that is less than or equal to the record
timestamp, then add `TimeOffset.system`.

For an end-stamped hourly aggregate:

```text
raw start = Aggregate.timestamp - Aggregate.timeInterval
raw end   = Aggregate.timestamp
wall endpoint = raw endpoint + TimeOffset.system_at_that_endpoint
```

The selection rule is supported by [Ian Whiffin's Powerlog timing
research](https://doubleblak.com/blogPost.php?k=powerlog). Older background and
the offset caveat are also described by [Mac4n6](https://www.mac4n6.com/blog/2018/12/16/on-the-third-day-of-apollo-my-true-love-gave-to-me-application-usage-to-determine-who-has-been-naughty-or-nice)
and [DFRWS](https://dfrws.org/presentation/time_well_spent/).

## Unit status for this archive

`Aggregate_RootNodeEnergy.Energy` is treated as **micro-watt-hours (uWh)**
only for the recognized schema fingerprint. The archive validation was:

```text
Meta AI direct RootNodeEnergy rows: 4,350,330 raw
4,350,330 × 0.001 mWh/raw = 4,350.330 mWh
Battery UI displayed total: 4,350 mWh (rounded)
```

That is strong archive-specific evidence for `0.001 mWh/raw`; it is not a
universal Apple contract. Other raw energy/power tables below remain marked
unknown until independently validated.
