import { useState, useEffect, useMemo, useCallback } from "react";
import { fetchETFs } from "../api/client";
import type {
  ETF,
  ETFTypeFilter,
  FSMAFilter,
  ETFSortKey,
} from "../types/etf";
import { parseFundSize } from "../types/etf";
import Autocomplete from "../components/Autocomplete";
import type { AutocompleteOption } from "../components/Autocomplete";
import ETFCard from "../components/ETFCard";
import StateMessage, { Spinner } from "../components/StateMessage";
import useInfiniteScroll from "../hooks/useInfiniteScroll";

export default function ETFPage() {
  const [allETFs, setAllETFs] = useState<ETF[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [selectedIndex, setSelectedIndex] = useState("Tous");
  const [selectedType, setSelectedType] = useState<ETFTypeFilter>("Tous");
  const [selectedFSMA, setSelectedFSMA] = useState<FSMAFilter>("Tous");
  const [sortKey, setSortKey] = useState<ETFSortKey>("fundSizeDesc");
  const [hideIncomplete, setHideIncomplete] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchETFs();
      setAllETFs(data.etfs || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const indexOptions = useMemo<AutocompleteOption[]>(() => {
    const counts: Record<string, number> = {};
    allETFs.forEach((etf) => {
      if (etf.index) counts[etf.index] = (counts[etf.index] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([value, count]) => ({ value, count }));
  }, [allETFs]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const cmp = (a: string, b: string) =>
      (a || "").localeCompare(b || "", "fr", { sensitivity: "base" });

    let results = allETFs.filter((etf) => {
      if (hideIncomplete && (!etf.provider || parseFundSize(etf.fundSize) === 0))
        return false;
      if (selectedIndex !== "Tous" && etf.index !== selectedIndex) return false;
      if (selectedType === "Capitalisant" && etf.type !== "accumulating")
        return false;
      if (selectedType === "Distribuant" && etf.type !== "distributing")
        return false;
      if (selectedFSMA === "FSMA" && !etf.fsmaCode) return false;
      if (selectedFSMA === "Hors FSMA" && etf.fsmaCode) return false;
      if (
        q &&
        !etf.name.toLowerCase().includes(q) &&
        !etf.isin.toLowerCase().includes(q) &&
        !etf.ticker.toLowerCase().includes(q) &&
        !(etf.provider && etf.provider.toLowerCase().includes(q)) &&
        !etf.index.toLowerCase().includes(q)
      )
        return false;
      return true;
    });

    results.sort((a, b) => {
      switch (sortKey) {
        case "name":
          return cmp(a.name, b.name);
        case "fundSizeDesc":
          return parseFundSize(b.fundSize) - parseFundSize(a.fundSize);
        case "fundSizeAsc":
          return parseFundSize(a.fundSize) - parseFundSize(b.fundSize);
        case "terAsc":
          return a.ter - b.ter;
        case "terDesc":
          return b.ter - a.ter;
        case "domicile":
          return cmp(a.domicile, b.domicile) || cmp(a.name, b.name);
        case "providerFirst": {
          const pA = a.provider ? 0 : 1,
            pB = b.provider ? 0 : 1;
          return pA !== pB ? pA - pB : cmp(a.name, b.name);
        }
        case "providerLast": {
          const pA = a.provider ? 1 : 0,
            pB = b.provider ? 1 : 0;
          return pA !== pB ? pA - pB : cmp(a.name, b.name);
        }
        default:
          return 0;
      }
    });

    return results;
  }, [allETFs, search, selectedIndex, selectedType, selectedFSMA, sortKey, hideIncomplete]);

  const { visible, Sentinel } = useInfiniteScroll(filtered);

  if (loading) return <Spinner text="Chargement des ETFs..." />;
  if (error)
    return (
      <StateMessage
        icon="⚠"
        title="Connexion impossible"
        detail={error}
        onRetry={load}
      />
    );
  if (allETFs.length === 0)
    return (
      <StateMessage
        icon="📉"
        title="Aucun ETF"
        detail="Impossible de charger les ETFs. Vérifiez votre connexion internet."
        onRetry={load}
      />
    );

  return (
    <div>
      {/* Search */}
      <div className="px-4 pt-2.5">
        <input
          type="search"
          placeholder="Nom, ISIN, ticker, provider, index..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl bg-white text-[0.92rem] outline-none focus:border-blue-500"
        />
      </div>

      {/* Filters */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 px-4 py-2.5">
        <Autocomplete
          label="Index"
          placeholder="Tous"
          allLabel="Tous"
          options={indexOptions}
          selected={selectedIndex}
          onSelect={setSelectedIndex}
        />
        <div>
          <label className="block text-[0.7rem] font-medium text-gray-400 mb-0.5">
            Type
          </label>
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value as ETFTypeFilter)}
            className="w-full px-2.5 py-2 border border-gray-300 rounded-lg bg-white text-sm outline-none focus:border-blue-500"
          >
            <option>Tous</option>
            <option>Capitalisant</option>
            <option>Distribuant</option>
          </select>
        </div>
        <div>
          <label className="block text-[0.7rem] font-medium text-gray-400 mb-0.5">
            FSMA
          </label>
          <select
            value={selectedFSMA}
            onChange={(e) => setSelectedFSMA(e.target.value as FSMAFilter)}
            className="w-full px-2.5 py-2 border border-gray-300 rounded-lg bg-white text-sm outline-none focus:border-blue-500"
          >
            <option>Tous</option>
            <option>FSMA</option>
            <option>Hors FSMA</option>
          </select>
        </div>
        <div>
          <label className="block text-[0.7rem] font-medium text-gray-400 mb-0.5">
            Tri
          </label>
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as ETFSortKey)}
            className="w-full px-2.5 py-2 border border-gray-300 rounded-lg bg-white text-sm outline-none focus:border-blue-500"
          >
            <option value="name">Nom</option>
            <option value="fundSizeDesc">Taille ↓</option>
            <option value="fundSizeAsc">Taille ↑</option>
            <option value="terAsc">TER ↑</option>
            <option value="terDesc">TER ↓</option>
            <option value="domicile">Pays</option>
            <option value="providerFirst">Avec provider</option>
            <option value="providerLast">Sans provider</option>
          </select>
        </div>
      </div>

      {/* Hide incomplete toggle */}
      <label className="flex items-center gap-2 px-4 pb-1.5 cursor-pointer select-none">
        <div
          role="switch"
          aria-checked={hideIncomplete}
          onClick={() => setHideIncomplete((v) => !v)}
          className={`relative w-9 h-5 rounded-full transition-colors ${hideIncomplete ? "bg-blue-500" : "bg-gray-300"}`}
        >
          <div
            className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${hideIncomplete ? "translate-x-4" : ""}`}
          />
        </div>
        <span className="text-[0.78rem] text-gray-500">
          Masquer sans provider / taille 0
        </span>
      </label>

      {/* Count */}
      <div className="px-4 pb-1.5 text-[0.78rem] text-gray-400 font-medium">
        {filtered.length} résultat(s)
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <StateMessage title="Aucun résultat" />
      ) : (
        <div className="flex flex-col gap-2.5 px-4 pb-6">
          {visible.map((etf) => (
            <ETFCard key={etf.isin} etf={etf} />
          ))}
          <Sentinel />
        </div>
      )}
    </div>
  );
}
