import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { create } from "tar";

const fixturePath = new URL("./sysdiagnose-query-mock.tar.gz", import.meta.url)
  .pathname;
const expectedPath = new URL(
  "./sysdiagnose-query-mock.expected.json",
  import.meta.url,
).pathname;
const archiveRoot =
  "sysdiagnose_2026.09.07_17-42-39-0700_iPhone-OS_iPhone_23G83_mock_powerlog";
const batteryWindowEnd = Date.parse("2026-09-08T00:00:00-07:00") / 1000;
const sysdiagnoseCaptureTime = Date.parse("2026-09-07T17:42:39-07:00") / 1000;
const powerlogEnd = 59_700_943;
const powerlogStart = powerlogEnd - 24 * 60 * 60;

const apps = [
  ["Safari", "com.apple.mobilesafari", 500, 3_600, 600],
  ["Tinder", "com.cardify.tinder", 440, 2_400, 900],
  ["Meta AI", "com.facebook.stellaapp", 320, 1_800, 1_200],
  ["YouTube Music", "com.google.ios.youtubemusic", 250, 900, 2_100],
  ["Maps", "com.apple.Maps", 180, 1_200, 300],
];

function random(seed) {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function xmlEscape(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;");
}

function batteryPlist() {
  const appRows = apps
    .map(
      ([name, bundleId, energy, foregroundSec, backgroundSec]) => `
        <dict>
          <key>CPU</key><real>${(energy * 0.5).toFixed(3)}</real>
          <key>DisplayDynamic</key><real>${(energy * 0.3).toFixed(3)}</real>
          <key>DRAM</key><real>${(energy * 0.2).toFixed(3)}</real>
          <key>PLBatteryUIAppNameKey</key><string>${xmlEscape(name)}</string>
          <key>PLBatteryUIAppBundleIDKey</key><string>${bundleId}</string>
          <key>PLBatteryUIAppEnergyUsedKey</key><real>${energy}</real>
          <key>PLBatteryUIAppForegroundRuntimeKey</key><real>${foregroundSec}</real>
          <key>PLBatteryUIAppBackgroundRuntimeKey</key><real>${backgroundSec}</real>
        </dict>`,
    )
    .join("");
  const levels = Array.from({ length: 96 }, (_, index) => {
    const level = Math.max(5, 96 - Math.floor(index * 0.72));
    return `<array><integer>${level}</integer><integer>0</integer></array>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
    <plist version="1.0"><dict>
      <key>Breakdown</key><dict><key>PLBatteryUIQueryRangeDayKey</key><dict>
        <key>PLBatteryUIAppArrayKey</key><array>${appRows}</array>
      </dict></dict>
      <key>Graph</key><dict><key>PLBatteryUIGraph24hrs</key><dict>
        <key>PLBatteryUIBatteryLevelsKey</key><array>${levels}</array>
      </dict></dict>
      <key>endOfDay</key><real>${batteryWindowEnd}</real>
    </dict></plist>`;
}

function powerlogSql() {
  const seeded = random(0x5eed);
  const expectedRawByApp = new Map(apps.map(([, bundleId]) => [bundleId, 0]));
  const expectedRawByComponent = new Map();
  const expectedRawByInterval = new Map();
  const addComponentInterval = (rootId, startMs, endMs, energy) => {
    const key = `${startMs}:${endMs}`;
    const interval = expectedRawByInterval.get(key) ?? {
      startMs,
      endMs,
      components: {},
    };
    const component = ["CPU", "DisplayDynamic", "DRAM"][
      componentIds.indexOf(rootId)
    ];
    interval.components[component] =
      (interval.components[component] ?? 0) + energy;
    expectedRawByInterval.set(key, interval);
  };
  const statements = [
    "PRAGMA journal_mode=OFF;",
    "CREATE TABLE PLCoalitionAgent_EventInterval_CoalitionInterval (timestamp REAL, timestampEnd REAL, BundleId TEXT, LaunchdName TEXT, energy REAL);",
    // The device schema also has timestamp here. Keeping it in the mock makes
    // root-energy joins fail if the worker leaves aggregate columns unqualified.
    "CREATE TABLE PLAccountingOperator_EventNone_Nodes (ID INTEGER PRIMARY KEY, timestamp REAL, Name TEXT, IsPermanent INTEGER);",
    "CREATE TABLE PLAccountingOperator_Aggregate_RootNodeEnergy (timestamp REAL, timeInterval REAL, Energy REAL, NodeID INTEGER, RootNodeID INTEGER);",
    "CREATE TABLE PLAppTimeService_Aggregate_AppRunTime (timestamp REAL, timeInterval REAL, ScreenOnTime REAL, BackgroundTime REAL, BundleID TEXT);",
    "CREATE TABLE PLStorageOperator_EventForward_TimeOffset (timestamp REAL, system REAL);",
  ];
  const initialOffset = sysdiagnoseCaptureTime - powerlogEnd;
  statements.push(
    `INSERT INTO PLStorageOperator_EventForward_TimeOffset VALUES (${powerlogStart}, ${initialOffset});`,
  );
  // Real archives contain a history of TimeOffset values. A small shift keeps
  // this mock aligned to the battery day while exercising piecewise lookup.
  statements.push(
    `INSERT INTO PLStorageOperator_EventForward_TimeOffset VALUES (${powerlogStart + 12 * 3600}, ${initialOffset + 2});`,
  );
  const componentIds = [900, 901, 902];
  ["CPU", "DisplayDynamic", "DRAM"].forEach((name, index) => {
    statements.push(
      `INSERT INTO PLAccountingOperator_EventNone_Nodes (ID, timestamp, Name, IsPermanent) VALUES (${componentIds[index]}, ${powerlogStart}, '${name}', 1);`,
    );
  });
  apps.forEach(([, bundleId], index) => {
    statements.push(
      `INSERT INTO PLAccountingOperator_EventNone_Nodes (ID, timestamp, Name, IsPermanent) VALUES (${index + 1}, ${powerlogStart}, '${bundleId}', 0);`,
    );
  });
  for (let hour = 0; hour < 24; hour += 1) {
    const timestamp = powerlogStart + hour * 3600;
    componentIds.forEach((rootId) => {
      const energy = 20_000 + Math.round(seeded() * 80_000);
      statements.push(
        `INSERT INTO PLAccountingOperator_Aggregate_RootNodeEnergy VALUES (${timestamp + 3600}, 3600, ${energy}, ${rootId}, ${rootId});`,
      );
      const wallStart =
        (timestamp + initialOffset + (hour >= 12 ? 2 : 0)) * 1000;
      const wallEnd =
        (timestamp + 3600 + initialOffset + (hour >= 11 ? 2 : 0)) * 1000;
      if (
        wallEnd > (batteryWindowEnd - 24 * 3600) * 1000 &&
        wallStart < batteryWindowEnd * 1000
      ) {
        expectedRawByComponent.set(
          rootId,
          (expectedRawByComponent.get(rootId) ?? 0) + energy,
        );
        addComponentInterval(rootId, wallStart, wallEnd, energy);
      }
    });
    apps.forEach(([, bundleId], appIndex) => {
      const coalitionEnergy = 10_000 + Math.round(seeded() * 20_000);
      statements.push(
        `INSERT INTO PLCoalitionAgent_EventInterval_CoalitionInterval VALUES (${timestamp}, ${timestamp + 3600}, '${bundleId}', '${bundleId}', ${coalitionEnergy});`,
      );
      statements.push(
        `INSERT INTO PLAppTimeService_Aggregate_AppRunTime VALUES (${timestamp + 3600}, 3600, ${300 + Math.round(seeded() * 1800)}, ${Math.round(seeded() * 900)}, '${bundleId}');`,
      );
      componentIds.forEach((rootId) => {
        const energy = 800 + Math.round(seeded() * 4_000) + appIndex * 100;
        statements.push(
          `INSERT INTO PLAccountingOperator_Aggregate_RootNodeEnergy VALUES (${timestamp + 3600}, 3600, ${energy}, ${appIndex + 1}, ${rootId});`,
        );
        const wallStart =
          (timestamp + initialOffset + (hour >= 12 ? 2 : 0)) * 1000;
        const wallEnd =
          (timestamp + 3600 + initialOffset + (hour >= 11 ? 2 : 0)) * 1000;
        if (
          wallEnd > (batteryWindowEnd - 24 * 3600) * 1000 &&
          wallStart < batteryWindowEnd * 1000
        ) {
          expectedRawByApp.set(
            bundleId,
            (expectedRawByApp.get(bundleId) ?? 0) + energy,
          );
          expectedRawByComponent.set(
            rootId,
            (expectedRawByComponent.get(rootId) ?? 0) + energy,
          );
          addComponentInterval(rootId, wallStart, wallEnd, energy);
        }
      });
    });
  }
  return {
    sql: `${statements.join("\n")}\n`,
    expected: Object.fromEntries(
      [...expectedRawByApp].map(([key, value]) => [
        key,
        Number((value / 1000).toFixed(3)),
      ]),
    ),
    expectedComponents: Object.fromEntries(
      componentIds.map((rootId, index) => [
        ["CPU", "DisplayDynamic", "DRAM"][index],
        Number(((expectedRawByComponent.get(rootId) ?? 0) / 1000).toFixed(3)),
      ]),
    ),
    expectedComponentIntervals: [...expectedRawByInterval.values()]
      .sort((left, right) => left.startMs - right.startMs)
      .map((interval) => ({
        startMs: interval.startMs,
        endMs: interval.endMs,
        componentEnergyMWh: Object.fromEntries(
          Object.entries(interval.components).map(([name, rawEnergy]) => [
            name,
            Number((rawEnergy / 1000).toFixed(3)),
          ]),
        ),
      })),
  };
}

const temp = mkdtempSync(join(tmpdir(), "uncommonstash-sysdiagnose-fixture-"));
try {
  const root = join(temp, archiveRoot);
  const powerlogDir = join(root, "logs/powerlogs");
  const plistDir = join(root, "logs/BatteryUIPlist");
  mkdirSync(powerlogDir, { recursive: true });
  mkdirSync(plistDir, { recursive: true });
  const databasePath = join(
    powerlogDir,
    "powerlog_2026-09-07_17-43_MOCK.PLSQL",
  );
  const powerlog = powerlogSql();
  execFileSync("sqlite3", [databasePath], { input: powerlog.sql });
  writeFileSync(join(plistDir, "BatteryUISysdiagnose.plist"), batteryPlist());
  writeFileSync(
    expectedPath,
    `${JSON.stringify({ appEnergyMWh: powerlog.expected, componentEnergyMWh: powerlog.expectedComponents, componentIntervals: powerlog.expectedComponentIntervals }, null, 2)}\n`,
  );
  await create(
    {
      cwd: temp,
      file: fixturePath,
      // Stored deflate blocks trade fixture size for identical output
      // across the zlib versions used by macOS and GitHub Actions.
      gzip: { level: 0 },
      noMtime: true,
      portable: true,
    },
    [archiveRoot],
  );
  console.log(
    `Wrote ${fixturePath} (${readFileSync(fixturePath).byteLength} bytes)`,
  );
} finally {
  rmSync(temp, { recursive: true, force: true });
}
