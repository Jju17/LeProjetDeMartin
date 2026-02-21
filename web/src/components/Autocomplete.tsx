import { useState, useRef, useEffect, useCallback } from "react";

export interface AutocompleteOption {
  value: string;
  count: number;
}

interface Props {
  label: string;
  placeholder: string;
  allLabel: string;
  options: AutocompleteOption[];
  selected: string;
  onSelect: (value: string) => void;
}

export default function Autocomplete({
  label,
  placeholder,
  allLabel,
  options,
  selected,
  onSelect,
}: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = query
    ? options.filter((o) =>
        o.value.toLowerCase().includes(query.toLowerCase())
      )
    : options;

  const allItems = [{ value: allLabel, count: -1 }, ...filtered];

  const handleSelect = useCallback(
    (value: string) => {
      onSelect(value);
      setQuery(value === allLabel ? "" : value);
      setOpen(false);
      setHighlighted(-1);
    },
    [allLabel, onSelect]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, allItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlighted >= 0 && highlighted < allItems.length) {
        handleSelect(allItems[highlighted].value);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  useEffect(() => {
    if (highlighted >= 0 && listRef.current) {
      const el = listRef.current.children[highlighted] as HTMLElement;
      el?.scrollIntoView({ block: "nearest" });
    }
  }, [highlighted]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const displayValue = selected === allLabel ? "" : selected;

  return (
    <div ref={wrapRef} className="relative">
      <label className="block text-[0.7rem] font-medium text-gray-400 mb-0.5">
        {label}
      </label>
      <div className="relative">
        <input
          type="text"
          className="w-full px-2.5 py-2 border border-gray-300 rounded-lg bg-white text-sm outline-none focus:border-blue-500 pr-7"
          placeholder={placeholder}
          value={open ? query : displayValue}
          onChange={(e) => {
            setQuery(e.target.value);
            setHighlighted(-1);
            if (!open) setOpen(true);
          }}
          onFocus={() => {
            setQuery(displayValue);
            setOpen(true);
          }}
          onKeyDown={handleKeyDown}
        />
        {selected !== allLabel && (
          <button
            className="absolute right-2 top-1/2 -translate-y-1/2 w-4.5 h-4.5 bg-gray-300 text-white rounded-full text-xs leading-none flex items-center justify-center hover:bg-gray-400"
            onClick={() => handleSelect(allLabel)}
            type="button"
          >
            &times;
          </button>
        )}
      </div>
      {open && (
        <div
          ref={listRef}
          className="absolute top-full left-0 right-0 bg-white border border-gray-300 border-t-0 rounded-b-lg max-h-56 overflow-y-auto z-50 shadow-lg"
        >
          {allItems.map((item, i) => (
            <div
              key={item.value}
              className={`flex justify-between items-center px-2.5 py-2 text-sm cursor-pointer transition-colors
                ${i === highlighted ? "bg-blue-50" : "hover:bg-gray-50"}
                ${item.value === selected ? "text-blue-500 font-semibold" : ""}`}
              onMouseEnter={() => setHighlighted(i)}
              onClick={() => handleSelect(item.value)}
            >
              <span className="truncate">{item.value}</span>
              {item.count >= 0 && (
                <span className="text-[0.7rem] text-gray-400 ml-2 shrink-0">
                  {item.count}
                </span>
              )}
            </div>
          ))}
          {allItems.length === 1 && (
            <div className="px-2.5 py-3 text-sm text-gray-400 text-center">
              Aucun r&eacute;sultat
            </div>
          )}
        </div>
      )}
    </div>
  );
}
