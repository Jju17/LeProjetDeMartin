import { useState, lazy, Suspense } from "react";
import { Spinner } from "./components/StateMessage";

const ETFPage = lazy(() => import("./pages/ETFPage"));
const FSMAPage = lazy(() => import("./pages/FSMAPage"));

type Tab = "etf" | "fsma";

export default function App() {
  const [tab, setTab] = useState<Tab>("etf");

  return (
    <div className="min-h-dvh bg-[#f2f2f7] text-gray-900 antialiased">
      {/* Header */}
      <header className="bg-white px-4 py-3.5 text-center border-b border-gray-200 sticky top-0 z-50">
        <h1 className="text-[1.05rem] font-semibold">Le Projet de Martin</h1>
      </header>

      {/* Tab bar */}
      <nav className="flex bg-white border-b border-gray-200 sticky top-[49px] z-40">
        <button
          className={`flex-1 py-2.5 text-[0.88rem] font-medium border-b-[2.5px] transition-colors ${
            tab === "etf"
              ? "text-blue-500 border-blue-500"
              : "text-gray-400 border-transparent"
          }`}
          onClick={() => setTab("etf")}
        >
          ETF Finder
        </button>
        <button
          className={`flex-1 py-2.5 text-[0.88rem] font-medium border-b-[2.5px] transition-colors ${
            tab === "fsma"
              ? "text-blue-500 border-blue-500"
              : "text-gray-400 border-transparent"
          }`}
          onClick={() => setTab("fsma")}
        >
          FSMA
        </button>
      </nav>

      {/* Content */}
      <main className="max-w-3xl mx-auto">
        <Suspense fallback={<Spinner text="Chargement..." />}>
          {tab === "etf" ? <ETFPage /> : <FSMAPage />}
        </Suspense>
      </main>
    </div>
  );
}
