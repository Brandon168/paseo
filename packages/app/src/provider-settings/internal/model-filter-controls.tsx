import { ChevronRight } from "lucide-react-native";
import { useCallback, useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import type { AgentModelDefinition } from "@getpaseo/protocol/agent-types";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { DropdownTrigger } from "@/components/ui/dropdown-trigger";
import { PressHighlight } from "@/components/ui/press-highlight";
import { SearchField } from "@/components/ui/search-field";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Switch } from "@/components/ui/switch";
import { CODE_SURFACE_DATASET } from "@/styles/code-surface";
import { settingsStyles } from "@/styles/settings";
import { ICON_SIZE, type Theme } from "@/styles/theme";
import type { ModelVisibilityFilter } from "./model-filter";

const ThemedChevron = withUnistyles(ChevronRight);
const mutedIconMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

export function ModelSearchFilterRail({
  query,
  onQueryChange,
  placeholder,
  searchTestID,
  visibilityFilter,
  onVisibilityFilterChange,
  filterTestIDPrefix,
  routes,
  selectedRoute = null,
  onRouteChange,
  routeTestID,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  placeholder: string;
  searchTestID: string;
  visibilityFilter: ModelVisibilityFilter;
  onVisibilityFilterChange: (value: ModelVisibilityFilter) => void;
  filterTestIDPrefix: string;
  routes?: readonly string[];
  selectedRoute?: string | null;
  onRouteChange?: (route: string | null) => void;
  routeTestID?: string;
}) {
  const { t } = useTranslation();
  const visibilityFilterOptions = useMemo(
    () => [
      {
        value: "all" as const,
        label: t("settings.providers.models.filterAll"),
        testID: `${filterTestIDPrefix}-filter-all`,
      },
      {
        value: "enabled" as const,
        label: t("settings.providers.models.filterEnabled"),
        testID: `${filterTestIDPrefix}-filter-enabled`,
      },
      {
        value: "disabled" as const,
        label: t("settings.providers.models.filterDisabled"),
        testID: `${filterTestIDPrefix}-filter-disabled`,
      },
    ],
    [filterTestIDPrefix, t],
  );

  const showRouteFilter = Boolean(routes && routes.length >= 2 && onRouteChange);
  const activeRoute = selectedRoute && routes?.includes(selectedRoute) ? selectedRoute : null;
  const handleClearRoute = useCallback(() => onRouteChange?.(null), [onRouteChange]);

  return (
    <View style={styles.searchRail}>
      <View style={styles.searchField}>
        <SearchField
          value={query}
          onChangeText={onQueryChange}
          placeholder={placeholder}
          clearAccessibilityLabel={t("sessions.actions.clearSearch")}
          fullWidth
          testID={searchTestID}
        />
      </View>
      {showRouteFilter ? (
        <DropdownMenu>
          <DropdownTrigger
            accessibilityLabel={t("settings.providers.models.filterByRoute")}
            testID={routeTestID}
          >
            {activeRoute ?? t("settings.providers.models.allRoutes")}
          </DropdownTrigger>
          <DropdownMenuContent side="bottom" align="start" width={260}>
            <DropdownMenuItem selected={activeRoute === null} onSelect={handleClearRoute}>
              {t("settings.providers.models.allRoutes")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {routes?.map((route) => (
              <RouteFilterItem
                key={route}
                route={route}
                selected={activeRoute === route}
                onSelect={onRouteChange!}
              />
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      <SegmentedControl
        options={visibilityFilterOptions}
        value={visibilityFilter}
        onValueChange={onVisibilityFilterChange}
        testID={`${filterTestIDPrefix}-visibility-filter`}
      />
    </View>
  );
}

function RouteFilterItem({
  route,
  selected,
  onSelect,
}: {
  route: string;
  selected: boolean;
  onSelect: (route: string | null) => void;
}) {
  const handleSelect = useCallback(() => onSelect(route), [onSelect, route]);
  return (
    <DropdownMenuItem selected={selected} onSelect={handleSelect}>
      {route}
    </DropdownMenuItem>
  );
}

export function ModelVisibilityBulkRail({
  hiddenCount,
  totalCount,
  saving,
  onShowAll,
  onHideAll,
  testIDPrefix,
}: {
  hiddenCount: number;
  totalCount: number;
  saving: boolean;
  onShowAll: () => void;
  onHideAll: () => void;
  testIDPrefix: string;
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.visibilityRail}>
      <Text style={styles.visibilityHint}>
        {hiddenCount > 0
          ? t("settings.providers.models.hiddenCount", { count: hiddenCount })
          : null}
      </Text>
      <View style={styles.visibilityActions}>
        <Button
          variant="ghost"
          size="sm"
          onPress={onShowAll}
          disabled={saving || hiddenCount === 0}
          testID={`${testIDPrefix}-show-all`}
        >
          {t("settings.providers.models.showAll")}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onPress={onHideAll}
          disabled={saving || hiddenCount === totalCount}
          testID={`${testIDPrefix}-hide-all`}
        >
          {t("settings.providers.models.hideAll")}
        </Button>
      </View>
    </View>
  );
}

export function DiscoveredModelRow({
  model,
  first,
  hidden,
  saving,
  onToggleVisible,
  leading,
  subtitle,
  onPress,
  pressAccessibilityLabel,
  rowTestID,
  switchTestID,
}: {
  model: AgentModelDefinition;
  first: boolean;
  hidden: boolean;
  saving: boolean;
  onToggleVisible: (modelId: string, visible: boolean) => void;
  leading?: ReactNode;
  subtitle?: string;
  onPress?: () => void;
  pressAccessibilityLabel?: string;
  rowTestID?: string;
  switchTestID?: string;
}) {
  const { t } = useTranslation();
  const handleValueChange = useCallback(
    (visible: boolean) => onToggleVisible(model.id, visible),
    [model.id, onToggleVisible],
  );

  const textBody = (
    <View style={styles.modelText}>
      <Text
        style={[styles.modelTitle, styles.shrinkText, hidden && styles.hiddenModelText]}
        numberOfLines={1}
      >
        {model.label}
      </Text>
      <Text
        style={[styles.monoHint, styles.shrinkText]}
        numberOfLines={1}
        selectable={!onPress}
        dataSet={CODE_SURFACE_DATASET}
      >
        {subtitle ?? model.id}
      </Text>
      {model.description ? (
        <Text style={styles.descriptionStacked} numberOfLines={1}>
          {model.description}
        </Text>
      ) : null}
    </View>
  );

  const toggle = (
    <View style={styles.modelSwitch}>
      <Switch
        value={!hidden}
        onValueChange={handleValueChange}
        disabled={saving}
        accessibilityLabel={t("settings.providers.models.showModel", { name: model.label })}
        testID={switchTestID ?? `provider-model-visible-${model.id}`}
      />
    </View>
  );

  if (onPress) {
    return (
      <View
        style={[styles.modelRow, styles.modelRowInteractive, !first && settingsStyles.rowBorder]}
        testID={rowTestID ?? `provider-model-row-${model.id}`}
      >
        {/* Keep the row navigation button and the visibility switch as siblings so Enter or
            clicks on the switch toggle in place without navigating away. */}
        <PressHighlight
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={pressAccessibilityLabel}
          style={styles.modelRowPressable}
          highlightStyle={styles.modelRowPressed}
        >
          {leading ? <View style={styles.leading}>{leading}</View> : null}
          {textBody}
          <ThemedChevron size={ICON_SIZE.sm} uniProps={mutedIconMapping} />
        </PressHighlight>
        {toggle}
      </View>
    );
  }

  return (
    <View
      style={[styles.modelRow, !first && settingsStyles.rowBorder]}
      testID={rowTestID ?? `provider-model-row-${model.id}`}
    >
      {/* Name over id in a column that shrinks, so a long name or id truncates instead of
          pushing the switch out of the row. */}
      {leading ? <View style={styles.leading}>{leading}</View> : null}
      {textBody}
      {toggle}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  // The search field and filters share a row, wrapping cleanly on narrow screens.
  searchRail: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: theme.spacing[2],
    marginBottom: theme.spacing[3],
  },
  searchField: {
    flexGrow: 1,
    flexBasis: 220,
    flexDirection: "row",
  },
  visibilityRail: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
    marginBottom: theme.spacing[2],
    minHeight: 32,
  },
  visibilityHint: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
  },
  visibilityActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  modelRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[4],
    gap: theme.spacing[3],
  },
  modelRowInteractive: {
    paddingVertical: 0,
    paddingLeft: 0,
    gap: theme.spacing[2],
  },
  modelRowPressable: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: theme.spacing[2],
    paddingLeft: theme.spacing[4],
    paddingRight: theme.spacing[2],
    gap: theme.spacing[3],
  },
  modelRowPressed: {
    backgroundColor: theme.colors.surface2,
  },
  leading: {
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  modelText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  modelTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    flexShrink: 0,
  },
  hiddenModelText: {
    color: theme.colors.foregroundMuted,
  },
  monoHint: {
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.code,
    color: theme.colors.foregroundMuted,
    flexShrink: 0,
  },
  shrinkText: {
    flexShrink: 1,
    minWidth: 0,
  },
  descriptionStacked: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
  },
  modelSwitch: {
    flexShrink: 0,
  },
}));
