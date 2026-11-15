import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import type { AgentUsage as AgentUsageFields } from "@getpaseo/protocol/agent-types";
import { AgentUsage, useAgentUsage } from "@/usage";
import {
  buildContextWindowInsights,
  type ContextWindowInsights,
  type TokenRowKey,
} from "./context-window-insights";
import { formatTokenCount } from "./context-window-meter.utils";

interface ContextWindowDetailsProps {
  serverId: string;
  agentId: string;
  context: {
    percentage: number;
    usedTokens: number;
    maxTokens: number;
  } | null;
  sessionCost: string | null;
  /** The agent's last reported usage: cache hit rates and token totals come from it. */
  usage?: AgentUsageFields | null;
  /** The hover card and tooltip title themselves; the sheet's header carries the title instead. */
  showTitle: boolean;
  /** Whether the usage cards have a Refresh button; without one they show their freshness. */
  refreshable: boolean;
}

/**
 * What the context window meter opens: how full the window is, then the usage of the agent's
 * account. The desktop hover card, the native wide tooltip, and the compact sheet all render it.
 */
export function ContextWindowDetails({
  serverId,
  agentId,
  context,
  sessionCost,
  usage,
  showTitle,
  refreshable,
}: ContextWindowDetailsProps) {
  const { t } = useTranslation();
  const insights = buildContextWindowInsights(usage);
  // A cost of zero on an agent that resolves to a plan account means its subscription covers it.
  const onPlan = useAgentUsage(serverId, agentId).kind === "ready";
  const showIncluded = !sessionCost && onPlan && usage?.totalCostUsd === 0;
  return (
    <>
      <View style={styles.summary}>
        {showTitle ? <Text style={styles.title}>{t("contextWindow.title")}</Text> : null}
        {context ? (
          <>
            <Text style={styles.text}>
              {t("contextWindow.used", { percentage: context.percentage })}
            </Text>
            <Text style={styles.detail}>
              {t("contextWindow.tokens", {
                used: formatTokenCount(context.usedTokens),
                max: formatTokenCount(context.maxTokens),
              })}
            </Text>
          </>
        ) : (
          <Text style={styles.detail}>{t("contextWindow.noData")}</Text>
        )}
        {sessionCost ? (
          <Text style={styles.detail}>{t("contextWindow.sessionCost", { cost: sessionCost })}</Text>
        ) : null}
        {showIncluded ? (
          <Text style={styles.detail}>{t("contextWindow.includedInPlan")}</Text>
        ) : null}
      </View>
      {insights ? <ContextInsights insights={insights} /> : null}
      <AgentUsage serverId={serverId} agentId={agentId} refreshable={refreshable} />
    </>
  );
}

const TOKEN_LABEL_KEYS: Record<TokenRowKey, string> = {
  cacheRead: "contextWindow.tokenCacheRead",
  cacheWrite: "contextWindow.tokenCacheWrite",
  input: "contextWindow.tokenInput",
  output: "contextWindow.tokenOutput",
  reasoning: "contextWindow.tokenReasoning",
};

function ContextInsights({ insights }: { insights: ContextWindowInsights }) {
  const { t } = useTranslation();
  return (
    <>
      <View style={styles.divider} />
      <View style={styles.summary} testID="context-window-insights">
        {insights.lastCallHitRate !== null || insights.sessionHitRate !== null ? (
          <Text style={styles.sectionTitle}>{t("contextWindow.cacheTitle")}</Text>
        ) : null}
        {insights.lastCallHitRate !== null ? (
          <Text style={insights.lastCallMissed ? styles.warning : styles.detail}>
            {t(
              insights.lastCallMissed ? "contextWindow.cacheMiss" : "contextWindow.cacheLastCall",
              {
                rate: Math.round(insights.lastCallHitRate),
              },
            )}
          </Text>
        ) : null}
        {insights.sessionHitRate !== null ? (
          <Text style={styles.detail}>
            {t("contextWindow.cacheSession", { rate: Math.round(insights.sessionHitRate) })}
          </Text>
        ) : null}
        {insights.tokens.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>{t("contextWindow.tokensTitle")}</Text>
            {insights.tokens.map((row) => (
              <View key={row.key} style={styles.tokenRow}>
                <Text style={styles.detail}>{t(TOKEN_LABEL_KEYS[row.key])}</Text>
                <Text style={styles.detail}>{formatTokenCount(row.value)}</Text>
              </View>
            ))}
          </>
        ) : null}
      </View>
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
  divider: { height: 1, backgroundColor: theme.colors.borderAccent },
  sectionTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    lineHeight: theme.fontSize.sm * 1.4,
  },
  warning: {
    color: theme.colors.palette.amber[500],
    fontSize: theme.fontSize.sm,
    lineHeight: theme.fontSize.sm * 1.4,
  },
  tokenRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: theme.spacing[3],
  },
  summary: {
    gap: theme.spacing[1.5],
    minWidth: 200,
  },
  title: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
  },
  text: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    lineHeight: theme.fontSize.base * 1.4,
  },
  detail: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    lineHeight: theme.fontSize.sm * 1.4,
  },
}));
