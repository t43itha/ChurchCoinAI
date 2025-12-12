import React from "react";
import {
  Sparkles,
  AlertCircle,
  Info,
  CheckCircle2,
  X,
  Clock,
  RefreshCw,
  ArrowRight,
} from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Doc } from "../../convex/_generated/dataModel";

type Suggestion = Doc<"intelligenceSuggestions">;

interface SmartSuggestionsPanelProps {
  maxItems?: number;
}

export const SmartSuggestionsPanel: React.FC<SmartSuggestionsPanelProps> = ({
  maxItems = 5,
}) => {
  const suggestions = useQuery(api.queries.intelligence.getPendingSuggestions, {
    limit: maxItems,
  });
  const suggestionCounts = useQuery(
    api.queries.intelligence.getSuggestionCounts,
    {}
  );
  const acceptSuggestion = useMutation(
    api.mutations.intelligence.acceptSuggestion
  );
  const dismissSuggestion = useMutation(
    api.mutations.intelligence.dismissSuggestion
  );
  const deferSuggestion = useMutation(
    api.mutations.intelligence.deferSuggestion
  );
  const regenerateInsights = useMutation(
    api.mutations.intelligence.regenerateInsights
  );

  const [regenerating, setRegenerating] = React.useState(false);

  const handleAccept = async (suggestion: Suggestion) => {
    await acceptSuggestion({ suggestionId: suggestion._id });
    // If there's an actionUrl, we could navigate there
    // For now, just accept and let the suggestion disappear
  };

  const handleDismiss = async (suggestionId: Suggestion["_id"]) => {
    await dismissSuggestion({ suggestionId });
  };

  const handleDefer = async (suggestionId: Suggestion["_id"]) => {
    await deferSuggestion({ suggestionId, deferDays: 7 });
  };

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      await regenerateInsights({});
      // Wait a bit for the scheduler to run
      setTimeout(() => setRegenerating(false), 2000);
    } catch {
      setRegenerating(false);
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case "critical":
        return <AlertCircle className="text-red-500" size={16} />;
      case "warning":
        return <AlertCircle className="text-amber-500" size={16} />;
      default:
        return <Info className="text-blue-500" size={16} />;
    }
  };

  const getSeverityLabel = (severity: string) => {
    switch (severity) {
      case "critical":
        return "Action Required";
      case "warning":
        return "Attention Needed";
      default:
        return "For Info";
    }
  };

  const loading = suggestions === undefined;

  return (
    <div className="swiss-card p-0 flex flex-col bg-white overflow-hidden">
      <div className="p-6 border-b border-ledger bg-sage-light/30 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles size={18} className="text-sage" />
          <h3 className="font-bold text-ink">Smart Suggestions</h3>
          {suggestionCounts && suggestionCounts.total > 0 && (
            <span className="text-xs bg-sage text-white px-2 py-0.5 rounded-full font-bold">
              {suggestionCounts.total}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {suggestionCounts && suggestionCounts.warning > 0 && (
            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
              {suggestionCounts.warning} warning
              {suggestionCounts.warning > 1 ? "s" : ""}
            </span>
          )}
          <button
            onClick={handleRegenerate}
            disabled={regenerating}
            className="p-1.5 rounded hover:bg-sage-light text-grey-mid hover:text-sage transition-colors disabled:opacity-50"
            title="Refresh suggestions"
          >
            <RefreshCw
              size={14}
              className={regenerating ? "animate-spin" : ""}
            />
          </button>
        </div>
      </div>

      <div className="divide-y divide-ledger">
        {loading && (
          <div className="p-12 text-center">
            <div className="animate-spin h-5 w-5 border-2 border-sage border-t-transparent rounded-full mx-auto mb-2" />
            <span className="text-sm text-grey-mid">
              Loading suggestions...
            </span>
          </div>
        )}

        {!loading && suggestions?.length === 0 && (
          <div className="p-12 text-center text-grey-mid">
            <CheckCircle2 size={32} className="mx-auto mb-3 text-sage" />
            <p className="text-sm font-medium">No suggestions at this time.</p>
            <p className="text-xs mt-1">Great job keeping things in order!</p>
          </div>
        )}

        {suggestions?.map((suggestion) => (
          <div
            key={suggestion._id}
            className="p-6 hover:bg-amber-light/30 transition-colors group"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  {getSeverityIcon(suggestion.severity)}
                  <span className="text-[10px] font-bold text-grey-mid uppercase tracking-wide">
                    {getSeverityLabel(suggestion.severity)}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-grey-light text-grey-mid font-medium">
                    {suggestion.insightType}
                  </span>
                </div>
                <h4 className="font-bold text-ink text-sm mb-1">
                  {suggestion.title}
                </h4>
                <p className="text-xs text-grey-mid leading-relaxed">
                  {suggestion.description}
                </p>
                {suggestion.suggestedAction && (
                  <div className="flex items-center gap-1 mt-2">
                    <ArrowRight size={12} className="text-sage" />
                    <span className="text-xs text-sage font-medium">
                      {suggestion.suggestedAction}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => handleAccept(suggestion)}
                  className="p-1.5 rounded hover:bg-sage-light text-sage"
                  title="Accept & Take Action"
                >
                  <CheckCircle2 size={16} />
                </button>
                <button
                  onClick={() => handleDefer(suggestion._id)}
                  className="p-1.5 rounded hover:bg-grey-light text-grey-mid"
                  title="Remind me in 7 days"
                >
                  <Clock size={16} />
                </button>
                <button
                  onClick={() => handleDismiss(suggestion._id)}
                  className="p-1.5 rounded hover:bg-red-50 text-red-400"
                  title="Dismiss"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SmartSuggestionsPanel;
