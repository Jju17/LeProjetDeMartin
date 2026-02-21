interface InfoItemProps {
  label: string;
  value: string;
  full?: boolean;
}

function InfoItem({ label, value, full }: InfoItemProps) {
  return (
    <div className={`select-text ${full ? "w-full" : ""}`}>
      <div className="text-[0.62rem] uppercase tracking-wide text-gray-400 font-medium">
        {label}
      </div>
      <div className="text-[0.78rem]">{value || "-"}</div>
    </div>
  );
}

interface Props {
  items: InfoItemProps[];
}

export default function InfoRow({ items }: Props) {
  return (
    <div className="flex justify-between mb-0.5">
      {items.map((item) => (
        <InfoItem key={item.label} {...item} />
      ))}
    </div>
  );
}
