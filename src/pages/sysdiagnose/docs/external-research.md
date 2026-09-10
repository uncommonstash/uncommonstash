# External Powerlog research

This is a research index, not an API specification. Apple documents how to
collect a sysdiagnose, but does not document the private Powerlog SQLite schema
or publish a stable unit contract for its fields. Every conclusion below is
therefore checked against the supplied archive before it affects the UI.

## What Apple publishes

| Source | What it establishes | What it does **not** establish |
| --- | --- | --- |
| [Apple: Profiles and Logs](https://developer.apple.com/feedback-assistant/profiles-and-logs/?name=sysdiagnose_) | iOS sysdiagnoses are supported diagnostic artifacts for Feedback Assistant. | Powerlog table names, relationships, timestamp conversion, or units. |
| [Apple: debug profiles and logging](https://developer.apple.com/news/?id=2o2p68bq) | A sysdiagnose contains extra framework/app diagnostic information for bug investigation. | That any private SQL field is an app-facing contract. |
| [Apple: Power Profiler](https://developer.apple.com/documentation/Xcode/measuring-your-app-s-power-use-with-power-profiler) | Apple publicly exposes a separate developer power-analysis tool. | That its UI or units map one-for-one to `CurrentPowerlog.PLSQL`. |

The practical conclusion is important: this project must treat Powerlog as a
versioned forensic artifact, not as an Apple SDK database.

## Independent forensic findings

| Finding | External evidence | How this project uses it |
| --- | --- | --- |
| Powerlog event timestamps require a per-record conversion through `PLStorageOperator_EventForward_TimeOffset`. | [Whiffin, 2025](https://doubleblak.com/blogPost.php?k=powerlog) demonstrates selecting the closest offset record that is not later than the event and adding the `system` value. | Schema-verified in the archive and implemented as a piecewise lookup. Never apply one database-wide offset. |
| Time offsets change and iOS versions differ. | [Mac4n6](https://www.mac4n6.com/blog/2018/12/16/on-the-third-day-of-apollo-my-true-love-gave-to-me-application-usage-to-determine-who-has-been-naughty-or-nice) reports offsets from seconds to 15 minutes and a version-dependent timestamp difference. [DFRWS](https://dfrws.org/presentation/time_well_spent/) is a dedicated presentation on Powerlog timing and monotonic clocks. | Do not display raw timestamp values as wall time; reject intervals outside TimeOffset coverage. |
| `RootNodeEnergy` plus the node dictionary can describe an app's energy by hardware/component in hourly aggregates. | [Punmy's Power Log analysis](https://punmy.cn/2018/06/12/iOS%20%E6%9C%80%E5%85%A8%E9%9D%A2%E7%9A%84%E5%8A%9F%E8%80%97%E5%88%86%E6%9E%90%E4%B9%8B%E2%80%94%E2%80%94Power%20Log/) identifies `Aggregate_RootNodeEnergy` as hourly app/component attribution and `EventNone_Nodes` as the ID/name dictionary. | Treat `NodeID` and `RootNodeID` as dynamic foreign keys resolved through the archive—not fixed constants. |
| The same database contains multiple data families and cadences. | [Punmy's table survey](https://punmy.cn/2018/06/12/iOS%20%E6%9C%80%E5%85%A8%E9%9D%A2%E7%9A%84%E5%8A%9F%E8%80%97%E5%88%86%E6%9E%90%E4%B9%8B%E2%80%94%E2%80%94Power%20Log/) distinguishes battery snapshots, battery UI data, app runtime, and hourly accounting. [Mac4n6](https://www.mac4n6.com/blog/2018/12/16/on-the-third-day-of-apollo-my-true-love-gave-to-me-application-usage-to-determine-who-has-been-naughty-or-nice) likewise warns against relying on a single database for every conclusion. | Do not substitute a Battery UI value for Powerlog energy, or an energy total for foreground/background time. |

## Claims deliberately not imported from research

| Claim | Why it is excluded from product semantics |
| --- | --- |
| A universal raw-energy multiplier | Public research is version/device dependent. This project only uses `0.001 mWh/raw` after matching the recognized schema and validating this archive against the Battery UI total. |
| A universal meaning for all battery, coalition, distribution, or qualification fields | Field names are suggestive, not contracts. They remain `Unknown` unless this archive or a reproducible validation establishes their unit and relationship. |
| A device-wide component total obtained from `NodeID = RootNodeID` | The supplied archive disproves that interpretation: root-self attribution is much smaller than all component-attribution rows in the same interval. |
| Synthetic sub-hour energy | `EnergyEstimateEvents` are more granular in this archive, but correction and distribution semantics remain unvalidated. A chart must not manufacture fine-grained mWh from them. |

## Review standard for future schema support

1. Capture the exact SQLite DDL and a small anonymized sample.
2. Identify the clock and validate offset selection at both interval endpoints.
3. Establish physical units against an independent artifact, not a field name.
4. Prove the aggregation is disjoint before calling it a total.
5. Add a deterministic mock archive and an oracle that does not reuse worker
   aggregation logic.

See [the local schema reference](./README.md) for the archive-specific facts
and confidence labels used by the implementation.
