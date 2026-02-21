import type { ETF } from "../types/etf";
import Tag from "./Tag";
import InfoRow from "./InfoRow";

interface Props {
  etf: ETF;
}

export default function ETFCard({ etf }: Props) {
  return (
    <div className="bg-white rounded-xl p-3.5 shadow-sm">
      <div className="text-[0.88rem] font-semibold mb-1.5 leading-snug select-text">
        {etf.name}
      </div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        <Tag text={etf.ticker} color="blue" />
        <Tag
          text={etf.type === "accumulating" ? "Acc" : "Dist"}
          color={etf.type === "accumulating" ? "green" : "orange"}
        />
        {etf.index && <Tag text={etf.index} color="purple" />}
        {etf.fsmaCode && <Tag text="FSMA" color="teal" />}
      </div>
      <InfoRow
        items={[
          { label: "ISIN", value: etf.isin },
          { label: "TER", value: `${etf.ter.toFixed(2)}%` },
        ]}
      />
      <InfoRow
        items={[
          { label: "Taille", value: etf.fundSize },
          { label: "Domicile", value: etf.domicile },
        ]}
      />
      <InfoRow
        items={[
          { label: "Provider", value: etf.provider || "-" },
          { label: "Devise", value: etf.currency },
        ]}
      />
      <InfoRow
        items={[
          { label: "Réplication", value: etf.replication },
          ...(etf.latestQuote
            ? [{ label: "Cours", value: `${etf.latestQuote.toFixed(2)} EUR` }]
            : []),
        ]}
      />
      {etf.quoteDate && (
        <InfoRow items={[{ label: "Date cours", value: etf.quoteDate }]} />
      )}
      {etf.fsmaCode && (
        <InfoRow items={[{ label: "FSMA Code", value: etf.fsmaCode }]} />
      )}
    </div>
  );
}
