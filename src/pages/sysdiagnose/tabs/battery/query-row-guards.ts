import type {
  AppEnergyAttributionRow,
  AppRuntimeRow,
  ComponentTotalRow,
  SysdiagnoseQueryRow,
} from "@/workers/sysdiagnose-query/query.protocol";

export function isComponentTotalRow(
  row: SysdiagnoseQueryRow,
): row is ComponentTotalRow {
  return "rootNode" in row && !("consumerNode" in row);
}

export function isAppEnergyAttributionRow(
  row: SysdiagnoseQueryRow,
): row is AppEnergyAttributionRow {
  return "consumerNode" in row;
}

export function isAppRuntimeRow(
  row: SysdiagnoseQueryRow,
): row is AppRuntimeRow {
  return "bundleId" in row;
}
