import React, { useState, useEffect, useRef, useCallback, useId } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../convex/_generated/api';
import { Id } from '../convex/_generated/dataModel';
import { Search, UserPlus, Check, Loader2, X } from 'lucide-react';

interface DonorSearchResult {
  _id: string;
  name: string;
  isGiftAidActive?: boolean;
  email?: string;
}

interface DonorSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onDonorSelect: (donor: {
    donorId: Id<"donors"> | null;
    donorName: string;
    isGiftAidActive: boolean;
    isNew: boolean;
  }) => void;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  showGiftAidBadge?: boolean;
}

const useDebounce = <T,>(value: T, delay: number): T => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
};

const DonorSearchInput: React.FC<DonorSearchInputProps> = ({
  value,
  onChange,
  onDonorSelect,
  placeholder = "Search or enter donor name...",
  disabled = false,
  autoFocus = false,
  showGiftAidBadge = true,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listboxId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Debounce search term to avoid excessive queries
  const debouncedSearch = useDebounce(value, 200);

  // Search query - only run when we have at least 2 characters
  const searchResults = useQuery(
    api.queries.donors.searchByName,
    debouncedSearch.length >= 2 ? { searchTerm: debouncedSearch } : "skip"
  ) as DonorSearchResult[] | undefined;

  // Find or create mutation
  const findOrCreate = useMutation(api.mutations.donors.findOrCreate);

  // Filter results and limit to 8
  const filteredResults = searchResults?.slice(0, 8) ?? [];

  // Show "Create new" option if no exact match
  const hasExactMatch = filteredResults.some(
    (d) => d.name.toLowerCase() === value.toLowerCase()
  );
  const showCreateOption = value.length >= 2 && !hasExactMatch;
  const totalOptions = filteredResults.length + (showCreateOption ? 1 : 0);
  const getOptionId = (index: number) => `${listboxId}-option-${index}`;
  const activeDescendant =
    isOpen && totalOptions > 0 ? getOptionId(selectedIndex) : undefined;

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen) {
        if (e.key === "ArrowDown" || e.key === "Enter") {
          setIsOpen(true);
        }
        return;
      }

      if (totalOptions === 0) {
        return;
      }

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((prev) => (prev + 1) % totalOptions);
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((prev) => (prev - 1 + totalOptions) % totalOptions);
          break;
        case "Enter":
          e.preventDefault();
          if (showCreateOption && selectedIndex === filteredResults.length) {
            handleCreateNew();
          } else if (filteredResults[selectedIndex]) {
            handleSelectDonor(filteredResults[selectedIndex]);
          }
          break;
        case "Escape":
          setIsOpen(false);
          break;
        case "Tab":
          setIsOpen(false);
          break;
      }
    },
    [isOpen, filteredResults, selectedIndex, showCreateOption, totalOptions, value]
  );

  // Handle selecting an existing donor
  const handleSelectDonor = (donor: DonorSearchResult) => {
    onChange(donor.name);
    onDonorSelect({
      donorId: donor._id as Id<"donors">,
      donorName: donor.name,
      isGiftAidActive: donor.isGiftAidActive ?? false,
      isNew: false,
    });
    setIsOpen(false);
  };

  // Handle creating a new donor
  const handleCreateNew = async () => {
    if (value.length < 2) return;

    setIsCreating(true);
    try {
      const result = await findOrCreate({
        name: value.trim(),
        isGiftAidEligible: false,
      });

      if (result.donorId) {
        onDonorSelect({
          donorId: result.donorId,
          donorName: result.matchedName || value.trim(),
          isGiftAidActive: false,
          isNew: result.isNew,
        });
        onChange(result.matchedName || value.trim());
      }
    } catch (error) {
      console.error("Failed to create donor:", error);
    } finally {
      setIsCreating(false);
      setIsOpen(false);
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Reset selected index when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredResults.length]);

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-grey-mid" />
        <input
          ref={inputRef}
          type="text"
          aria-label="Search donor"
          role="combobox"
          aria-autocomplete="list"
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-activedescendant={activeDescendant}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => value.length >= 2 && setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          autoFocus={autoFocus}
          className="w-full h-10 pl-9 pr-8 text-sm border border-ledger rounded-md bg-white
                     focus:outline-none focus:ring-1 focus:ring-ink focus:border-ink
                     disabled:bg-grey-light disabled:cursor-not-allowed
                     font-mono"
        />
        {value && !disabled && (
          <button
            type="button"
            onClick={() => {
              onChange("");
              onDonorSelect({
                donorId: null,
                donorName: "",
                isGiftAidActive: false,
                isNew: false,
              });
              inputRef.current?.focus();
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-grey-light rounded"
            aria-label="Clear donor search"
          >
            <X className="h-3 w-3 text-grey-mid" />
          </button>
        )}
      </div>

      {/* Dropdown */}
      {isOpen && (value.length >= 2 || filteredResults.length > 0) && (
        <div
          id={listboxId}
          ref={dropdownRef}
          role="listbox"
          className="absolute z-50 w-full mt-1 bg-white border border-ledger rounded-md shadow-soft-lg max-h-64 overflow-y-auto"
        >
          {/* Loading state */}
          {debouncedSearch !== value && value.length >= 2 && (
            <div className="px-3 py-2 text-sm text-grey-mid flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Searching...
            </div>
          )}

          {/* Results */}
          {filteredResults.map((donor, index) => (
            <button
              key={donor._id}
              id={getOptionId(index)}
              role="option"
              aria-selected={selectedIndex === index}
              type="button"
              onClick={() => handleSelectDonor(donor)}
              onMouseEnter={() => setSelectedIndex(index)}
              className={`w-full px-3 py-2 text-left text-sm flex items-center justify-between
                         hover:bg-amber-50 transition-colors
                         ${selectedIndex === index ? "bg-amber-50" : ""}`}
            >
              <div className="flex items-center gap-2">
                <span className="font-mono">{donor.name}</span>
                {donor.email && (
                  <span className="text-grey-mid text-xs truncate max-w-[120px]">
                    {donor.email}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {showGiftAidBadge && donor.isGiftAidActive && (
                  <span className="bg-sage-100 text-sage-700 border border-sage-300 px-1.5 py-0.5 text-[10px] rounded font-medium">
                    Gift Aid
                  </span>
                )}
                {selectedIndex === index && (
                  <Check className="h-4 w-4 text-sage" />
                )}
              </div>
            </button>
          ))}

          {/* No results message */}
          {filteredResults.length === 0 &&
            debouncedSearch === value &&
            value.length >= 2 && (
              <div className="px-3 py-2 text-sm text-grey-mid">
                No donors found
              </div>
            )}

          {/* Create new option */}
          {showCreateOption && (
            <button
              id={getOptionId(filteredResults.length)}
              role="option"
              aria-selected={selectedIndex === filteredResults.length}
              type="button"
              onClick={handleCreateNew}
              onMouseEnter={() => setSelectedIndex(filteredResults.length)}
              disabled={isCreating}
              className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 border-t border-ledger
                         hover:bg-sage-50 transition-colors
                         ${selectedIndex === filteredResults.length ? "bg-sage-50" : ""}
                         ${isCreating ? "opacity-50 cursor-wait" : ""}`}
            >
              {isCreating ? (
                <Loader2 className="h-4 w-4 animate-spin text-sage-600" />
              ) : (
                <UserPlus className="h-4 w-4 text-sage-600" />
              )}
              <span className="font-medium text-sage-700">
                Create "{value.trim()}"
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default DonorSearchInput;
