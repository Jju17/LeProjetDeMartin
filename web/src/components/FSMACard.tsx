import type { FSMACompartment } from "../types/fsma";
import Tag from "./Tag";
import InfoRow from "./InfoRow";

interface Props {
  compartment: FSMACompartment;
}

export default function FSMACard({ compartment: c }: Props) {
  return (
    <div className="bg-white rounded-xl p-3.5 shadow-sm">
      <div className="text-[0.88rem] font-semibold mb-1.5 leading-snug select-text">
        {c.compartmentNameFR || "-"}
      </div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        <Tag text={c.compartmentCode || "-"} color="teal" />
        <Tag text={c.cisNationality || "-"} color="blue" />
      </div>
      <InfoRow
        items={[
          { label: "CIS", value: c.cisNameFR },
          { label: "Code CIS", value: c.cisCode },
        ]}
      />
      <InfoRow
        items={[
          {
            label: "Société de gestion",
            value: c.cisManagementCompanyFR,
            full: true,
          },
        ]}
      />
      <InfoRow
        items={[
          { label: "Forme juridique", value: c.cisLegalFormFR },
          { label: "Gestion", value: c.cisManagementType },
        ]}
      />
      {c.shareClassISIN && (
        <InfoRow
          items={[
            { label: "ISIN", value: c.shareClassISIN },
            ...(c.shareClassCurrency
              ? [{ label: "Devise", value: c.shareClassCurrency }]
              : []),
          ]}
        />
      )}
    </div>
  );
}
