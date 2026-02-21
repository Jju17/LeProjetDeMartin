import { useState, useEffect, useMemo, useCallback } from "react";
import { fetchFSMA } from "../api/client";
import type { FSMACompartment, FSMASortKey } from "../types/fsma";
import Autocomplete from "../components/Autocomplete";
import type { AutocompleteOption } from "../components/Autocomplete";
import FSMACard from "../components/FSMACard";
import StateMessage, { Spinner } from "../components/StateMessage";
import useInfiniteScroll from "../hooks/useInfiniteScroll";

export default function FSMAPage() {
  const [all, setAll] = useState<FSMACompartment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const [search, setSearch] = useState("");
  const [selectedNationality, setSelectedNationality] = useState("Toutes");
  const [selectedManagement, setSelectedManagement] = useState("Toutes");
  const [sortKey, setSortKey] = useState<FSMASortKey>("name");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchFSMA();
      setAll(data.compartments || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!loaded) load();
  }, [loaded, load]);

  const nationalityOptions = useMemo<AutocompleteOption[]>(() => {
    const counts: Record<string, number> = {};
    all.forEach((c) => {
      const n = c.cisNationality;
      if (n) counts[n] = (counts[n] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([value, count]) => ({ value, count }));
  }, [all]);

  const managementOptions = useMemo<AutocompleteOption[]>(() => {
    const counts: Record<string, number> = {};
    all.forEach((c) => {
      const m = c.cisManagementCompanyFR;
      if (m) counts[m] = (counts[m] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([value, count]) => ({ value, count }));
  }, [all]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const cmp = (a: string, b: string) =>
      (a || "").localeCompare(b || "", "fr", { sensitivity: "base" });

    let results = all.filter((c) => {
      if (
        selectedNationality !== "Toutes" &&
        c.cisNationality !== selectedNationality
      )
        return false;
      if (
        selectedManagement !== "Toutes" &&
        c.cisManagementCompanyFR !== selectedManagement
      )
        return false;
      if (
        q &&
        !(c.compartmentNameFR || "").toLowerCase().includes(q) &&
        !(c.compartmentCode || "").toLowerCase().includes(q) &&
        !(c.cisNameFR || "").toLowerCase().includes(q) &&
        !(c.cisNationality || "").toLowerCase().includes(q) &&
        !(c.cisManagementCompanyFR || "").toLowerCase().includes(q)
      )
        return false;
      return true;
    });

    results.sort((a, b) => {
      switch (sortKey) {
        case "name":
          return cmp(a.compartmentNameFR, b.compartmentNameFR);
        case "nationality":
          return (
            cmp(a.cisNationality, b.cisNationality) ||
            cmp(a.compartmentNameFR, b.compartmentNameFR)
          );
        case "management":
          return (
            cmp(a.cisManagementCompanyFR, b.cisManagementCompanyFR) ||
            cmp(a.compartmentNameFR, b.compartmentNameFR)
          );
        case "code":
          return cmp(a.compartmentCode, b.compartmentCode);
        default:
          return 0;
      }
    });

    return results;
  }, [all, search, selectedNationality, selectedManagement, sortKey]);

  const { visible, Sentinel } = useInfiniteScroll(filtered);

  if (loading) return <Spinner text="Chargement de la liste FSMA..." />;
  if (error)
    return (
      <StateMessage
        icon="⚠"
        title="Connexion impossible"
        detail={error}
        onRetry={load}
      />
    );
  if (loaded && all.length === 0)
    return (
      <StateMessage
        icon="📋"
        title="Aucune donnée"
        detail="Impossible de charger la liste FSMA. Vérifiez votre connexion internet."
        onRetry={load}
      />
    );

  return (
    <div>
      {/* Search */}
      <div className="px-4 pt-2.5">
        <input
          type="search"
          placeholder="Nom, code FSMA, société de gestion..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl bg-white text-[0.92rem] outline-none focus:border-blue-500"
        />
      </div>

      {/* Filters */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 px-4 py-2.5">
        <Autocomplete
          label="Nationalité"
          placeholder="Toutes"
          allLabel="Toutes"
          options={nationalityOptions}
          selected={selectedNationality}
          onSelect={setSelectedNationality}
        />
        <Autocomplete
          label="Société de gestion"
          placeholder="Toutes"
          allLabel="Toutes"
          options={managementOptions}
          selected={selectedManagement}
          onSelect={setSelectedManagement}
        />
        <div>
          <label className="block text-[0.7rem] font-medium text-gray-400 mb-0.5">
            Tri
          </label>
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as FSMASortKey)}
            className="w-full px-2.5 py-2 border border-gray-300 rounded-lg bg-white text-sm outline-none focus:border-blue-500"
          >
            <option value="name">Nom</option>
            <option value="nationality">Nationalité</option>
            <option value="management">Société de gestion</option>
            <option value="code">Code</option>
          </select>
        </div>
      </div>

      {/* Count */}
      <div className="px-4 pb-1.5 text-[0.78rem] text-gray-400 font-medium">
        {filtered.length} compartiment(s)
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <StateMessage title="Aucun résultat" />
      ) : (
        <div className="flex flex-col gap-2.5 px-4 pb-6">
          {visible.map((c) => (
            <FSMACard key={c.compartmentCode + c.shareClassCode} compartment={c} />
          ))}
          <Sentinel />
        </div>
      )}
    </div>
  );
}
