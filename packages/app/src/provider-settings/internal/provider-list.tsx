import { Plus } from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import type { AgentModelDefinition } from "@getpaseo/protocol/agent-types";
import { useProviderInstallation } from "@/components/provider-installation";
import { SettingsAddRow, SettingsCard, SettingsSection } from "@/components/settings";
import { Button } from "@/components/ui/button";
import { SkeletonPulse, useSkeletonPulse } from "@/components/ui/skeleton";
import { useToast } from "@/contexts/toast-api-context";
import { useDaemonConfig } from "@/hooks/use-daemon-config";
import { useProvidersSnapshot } from "@/hooks/use-providers-snapshot";
import { useHostRuntimeIsConnected } from "@/runtime/host-runtime";
import { settingsStyles } from "@/styles/settings";
import { ICON_SIZE } from "@/styles/theme";
import { buildProviderDefinitions } from "@/utils/provider-definitions";
import { AddProviderSheet } from "./add-provider-sheet";
import { resolveProviderDiscoveredModels } from "./discovered-models";
import { filterAndRankModelEntries, type ModelVisibilityFilter } from "./model-filter";
import {
  DiscoveredModelRow,
  ModelSearchFilterRail,
  ModelVisibilityBulkRail,
} from "./model-filter-controls";
import { useProviderConfigActions, type ProviderEntry } from "./provider-config";
import { ProviderGlyph } from "./provider-glyph";
import { ProviderNotice } from "./provider-notice";
import { ProviderRow } from "./provider-row";
import { readRowSummary } from "./row-summary";
import type { ProviderSheetFrame } from "./sheet-frame";

export interface ProviderListProps {
  serverId: string;
  /** Opens a provider's detail wherever the host shows it: a Settings page or a sheet. */
  onOpenProvider: (providerId: string) => void;
  /** Where the sheets the list opens sit. Defaults to a sheet over the current screen. */
  sheetFrame?: ProviderSheetFrame;
  /** Shows a cross-provider model search and visibility filter above the list. */
  showModelSearch?: boolean;
}

interface GlobalProviderModelItem {
  provider: string;
  providerLabel: string;
  model: AgentModelDefinition;
  hidden: boolean;
}

/** The host's providers, each saying how it is, and the way to add one. */
export function ProviderList({
  serverId,
  onOpenProvider,
  sheetFrame,
  showModelSearch = false,
}: ProviderListProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const isConnected = useHostRuntimeIsConnected(serverId) && serverId.length > 0;
  const { entries, isLoading, refresh: refreshProviderSnapshot } = useProvidersSnapshot(serverId);
  const { config, patchConfig } = useDaemonConfig(serverId);
  const { setEnabled, togglingProviderId } = useProviderConfigActions(serverId);
  const definitions = useMemo(() => buildProviderDefinitions(entries), [entries]);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [visibilityFilter, setVisibilityFilter] = useState<ModelVisibilityFilter>("all");
  const [pendingHiddenByProvider, setPendingHiddenByProvider] = useState<Record<string, string[]>>(
    {},
  );
  const [savingVisibility, setSavingVisibility] = useState(false);

  const openAdd = useCallback(() => setAdding(true), []);
  const closeAdd = useCallback(() => setAdding(false), []);
  const handleAdded = useCallback(
    (providerId: string) => {
      setAdding(false);
      onOpenProvider(providerId);
    },
    [onOpenProvider],
  );

  const providerHiddenLists = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const definition of definitions) {
      const entry = entries?.find((candidate) => candidate.provider === definition.id);
      if (!entry || !entry.enabled) continue;
      const pending = pendingHiddenByProvider[entry.provider];
      if (pending !== undefined) {
        map.set(entry.provider, pending);
        continue;
      }
      const configured = config?.providers?.[entry.provider]?.hiddenModels;
      if (configured !== undefined) {
        map.set(entry.provider, configured);
        continue;
      }
      const { models } = resolveProviderDiscoveredModels({
        serverId,
        provider: entry.provider,
        currentModels: entry.models,
        providerSnapshotRefreshing: false,
        previousCache: null,
      });
      map.set(
        entry.provider,
        models.filter((model) => model.hidden === true).map((model) => model.id),
      );
    }
    return map;
  }, [config?.providers, definitions, entries, pendingHiddenByProvider, serverId]);

  const globalModels = useMemo<GlobalProviderModelItem[]>(() => {
    if (!showModelSearch) return [];
    const items: GlobalProviderModelItem[] = [];
    for (const definition of definitions) {
      const entry = entries?.find((candidate) => candidate.provider === definition.id);
      if (!entry || !entry.enabled) continue;
      const { models } = resolveProviderDiscoveredModels({
        serverId,
        provider: entry.provider,
        currentModels: entry.models,
        providerSnapshotRefreshing: false,
        previousCache: null,
      });
      const hiddenIds = new Set(providerHiddenLists.get(entry.provider) ?? []);
      for (const model of models) {
        items.push({
          provider: entry.provider,
          providerLabel: definition.label,
          model,
          hidden: hiddenIds.has(model.id),
        });
      }
    }
    return items;
  }, [definitions, entries, providerHiddenLists, serverId, showModelSearch]);

  const q = query.trim();
  const isSearchingModels = showModelSearch && (q.length > 0 || visibilityFilter !== "all");
  const filteredGlobalModels = useMemo(
    () =>
      isSearchingModels
        ? filterAndRankModelEntries(globalModels, {
            query: q,
            visibility: visibilityFilter,
            getModel: (item) => item.model,
            getHidden: (item) => item.hidden,
            getExtraFields: (item) => [item.providerLabel, item.provider],
          })
        : [],
    [globalModels, isSearchingModels, q, visibilityFilter],
  );

  const listedHiddenCount = useMemo(
    () => filteredGlobalModels.filter((item) => item.hidden).length,
    [filteredGlobalModels],
  );

  const saveProviderHiddenModels = useCallback(
    (updates: Record<string, string[]>) => {
      const providers = Object.keys(updates);
      if (providers.length === 0) return;
      const providersPatch = Object.fromEntries(
        providers.map((provider) => [provider, { hiddenModels: updates[provider] }]),
      );
      setPendingHiddenByProvider((current) => ({ ...current, ...updates }));
      setSavingVisibility(true);
      void patchConfig({ providers: providersPatch })
        .then(() => refreshProviderSnapshot(providers))
        .catch((err: unknown) => {
          toast.error(
            err instanceof Error ? err.message : t("settings.providers.models.failedToSave"),
          );
        })
        .finally(() => {
          setSavingVisibility(false);
          setPendingHiddenByProvider((current) => {
            const next = { ...current };
            for (const provider of providers) delete next[provider];
            return next;
          });
        });
    },
    [patchConfig, refreshProviderSnapshot, t, toast],
  );

  const handleToggleGlobalModel = useCallback(
    (provider: string, modelId: string, show: boolean) => {
      const current = providerHiddenLists.get(provider) ?? [];
      const next = show
        ? current.filter((id) => id !== modelId)
        : [...current.filter((id) => id !== modelId), modelId];
      saveProviderHiddenModels({ [provider]: next });
    },
    [providerHiddenLists, saveProviderHiddenModels],
  );

  const handleSetListedVisible = useCallback(
    (show: boolean) => {
      const grouped = new Map<string, Set<string>>();
      for (const item of filteredGlobalModels) {
        let ids = grouped.get(item.provider);
        if (!ids) {
          ids = new Set();
          grouped.set(item.provider, ids);
        }
        ids.add(item.model.id);
      }
      const updates: Record<string, string[]> = {};
      for (const [provider, listedIds] of grouped) {
        const current = providerHiddenLists.get(provider) ?? [];
        const kept = current.filter((id) => !listedIds.has(id));
        const next = show ? kept : [...kept, ...listedIds];
        if (next.length !== current.length || next.some((id, index) => id !== current[index])) {
          updates[provider] = next;
        }
      }
      saveProviderHiddenModels(updates);
    },
    [filteredGlobalModels, providerHiddenLists, saveProviderHiddenModels],
  );

  const handleShowListed = useCallback(
    () => handleSetListedVisible(true),
    [handleSetListedVisible],
  );
  const handleHideListed = useCallback(
    () => handleSetListedVisible(false),
    [handleSetListedVisible],
  );

  const addButton = useMemo(
    () =>
      isConnected ? (
        <Button
          variant="ghost"
          leftIcon={Plus}
          onPress={openAdd}
          accessibilityLabel={t("settings.providers.addProvider")}
          testID="provider-list-add"
        >
          {t("settings.providers.list.add")}
        </Button>
      ) : null,
    [isConnected, openAdd, t],
  );

  const noModelMatches =
    visibilityFilter === "all"
      ? t("settings.providers.models.noSearchMatches")
      : t("settings.providers.models.noFilterMatches");

  let body: React.ReactNode;
  if (!isConnected) {
    body = <ProviderNotice message={t("settings.providers.unavailable")} />;
  } else if (isLoading) {
    body = <ProviderRowsSkeleton />;
  } else if (isSearchingModels) {
    body = (
      <>
        {filteredGlobalModels.length > 0 ? (
          <ModelVisibilityBulkRail
            hiddenCount={listedHiddenCount}
            totalCount={filteredGlobalModels.length}
            saving={savingVisibility}
            onShowAll={handleShowListed}
            onHideAll={handleHideListed}
            testIDPrefix="providers-models"
          />
        ) : null}
        <View style={settingsStyles.card}>
          <ScrollView
            style={styles.discoveredList}
            nestedScrollEnabled
            testID="providers-global-model-results"
          >
            {filteredGlobalModels.length === 0 ? (
              <View style={styles.emptyRow}>
                <Text style={settingsStyles.sectionHeaderTitle}>{noModelMatches}</Text>
              </View>
            ) : (
              filteredGlobalModels.map((item, index) => (
                <GlobalDiscoveredModelRow
                  key={`${item.provider}:${item.model.id}`}
                  serverId={serverId}
                  item={item}
                  first={index === 0}
                  saving={savingVisibility}
                  onOpenProvider={onOpenProvider}
                  onToggleVisible={handleToggleGlobalModel}
                />
              ))
            )}
          </ScrollView>
        </View>
      </>
    );
  } else {
    body = (
      <SettingsCard testID="provider-list">
        {definitions.map((definition) => {
          const entry = entries?.find((candidate) => candidate.provider === definition.id);
          if (!entry) return null;
          return (
            <ListedProvider
              key={definition.id}
              serverId={serverId}
              entry={entry}
              label={definition.label}
              toggling={togglingProviderId === definition.id}
              onOpen={onOpenProvider}
              onToggle={setEnabled}
            />
          );
        })}
        <SettingsAddRow
          label={t("settings.providers.addProvider")}
          onPress={openAdd}
          testID="provider-list-add-row"
        />
      </SettingsCard>
    );
  }

  return (
    <>
      <SettingsSection
        title={t("settings.providers.title")}
        trailing={addButton}
        testID="host-page-providers-card"
      >
        {showModelSearch && isConnected && !isLoading ? (
          <ModelSearchFilterRail
            query={query}
            onQueryChange={setQuery}
            placeholder={t("settings.providers.models.searchAllPlaceholder")}
            searchTestID="providers-global-search"
            visibilityFilter={visibilityFilter}
            onVisibilityFilterChange={setVisibilityFilter}
            filterTestIDPrefix="providers-models"
          />
        ) : null}
        {body}
      </SettingsSection>
      {isConnected ? (
        <AddProviderSheet
          serverId={serverId}
          visible={adding}
          onClose={closeAdd}
          onAdded={handleAdded}
          frame={sheetFrame}
        />
      ) : null}
    </>
  );
}

function GlobalDiscoveredModelRow({
  serverId,
  item,
  first,
  saving,
  onOpenProvider,
  onToggleVisible,
}: {
  serverId: string;
  item: GlobalProviderModelItem;
  first: boolean;
  saving: boolean;
  onOpenProvider: (providerId: string) => void;
  onToggleVisible: (providerId: string, modelId: string, visible: boolean) => void;
}) {
  const { t } = useTranslation();
  const handleOpen = useCallback(
    () => onOpenProvider(item.provider),
    [item.provider, onOpenProvider],
  );
  const handleToggle = useCallback(
    (modelId: string, visible: boolean) => onToggleVisible(item.provider, modelId, visible),
    [item.provider, onToggleVisible],
  );
  const leading = useMemo(
    () => <ProviderGlyph serverId={serverId} provider={item.provider} size={ICON_SIZE.sm} />,
    [item.provider, serverId],
  );

  return (
    <DiscoveredModelRow
      model={item.model}
      first={first}
      hidden={item.hidden}
      saving={saving}
      onToggleVisible={handleToggle}
      leading={leading}
      subtitle={`${item.providerLabel} · ${item.model.id}`}
      onPress={handleOpen}
      pressAccessibilityLabel={t("settings.providers.models.openModelProvider", {
        model: item.model.label,
        provider: item.providerLabel,
      })}
      rowTestID={`providers-global-model-row-${item.provider}-${item.model.id}`}
      switchTestID={`providers-global-model-visible-${item.provider}-${item.model.id}`}
    />
  );
}

/** A row reads its provider's installation itself; the detail shares the same requests. */
function ListedProvider({
  serverId,
  entry,
  label,
  toggling,
  onOpen,
  onToggle,
}: {
  serverId: string;
  entry: ProviderEntry;
  label: string;
  toggling: boolean;
  onOpen: (provider: string) => void;
  onToggle: (provider: string, enabled: boolean) => void;
}) {
  const installation = useProviderInstallation({
    serverId,
    provider: entry.provider,
    visible: true,
  });
  const icon = useMemo(
    () => <ProviderGlyph serverId={serverId} provider={entry.provider} />,
    [entry.provider, serverId],
  );
  return (
    <ProviderRow
      provider={entry.provider}
      label={label}
      icon={icon}
      summary={readRowSummary(entry, installation)}
      enabled={entry.enabled}
      toggling={toggling}
      onOpen={onOpen}
      onToggle={onToggle}
    />
  );
}

const SKELETON_ROW_KEYS = [0, 1, 2, 3].map((index) => `provider-skeleton-row-${index}`);

function ProviderRowsSkeleton() {
  const { t } = useTranslation();
  const pulse = useSkeletonPulse();
  return (
    <View
      style={settingsStyles.card}
      accessibilityLabel={t("settings.providers.loading")}
      testID="providers-skeleton"
    >
      {SKELETON_ROW_KEYS.map((key, index) => (
        <View key={key} style={[settingsStyles.row, index > 0 && settingsStyles.rowBorder]}>
          <View style={styles.skeletonContent}>
            <SkeletonPulse pulse={pulse} style={styles.skeletonIcon} />
            <SkeletonPulse pulse={pulse} style={styles.skeletonTitle} />
          </View>
          <SkeletonPulse pulse={pulse} style={styles.skeletonSwitch} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  discoveredList: {
    maxHeight: 420,
  },
  emptyRow: {
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
  },
  skeletonContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
  },
  skeletonIcon: {
    width: 16,
    height: 16,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface2,
  },
  skeletonTitle: {
    width: 160,
    height: 12,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: theme.colors.surface2,
  },
  skeletonSwitch: {
    width: 36,
    height: 20,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surface2,
  },
}));
