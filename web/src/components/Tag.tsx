const colorMap = {
  blue: "bg-blue-500/12 text-blue-500",
  green: "bg-green-500/12 text-green-600",
  orange: "bg-orange-400/12 text-orange-500",
  purple: "bg-purple-500/12 text-purple-500",
  teal: "bg-teal-400/12 text-teal-600",
} as const;

type TagColor = keyof typeof colorMap;

interface Props {
  text: string;
  color: TagColor;
}

export default function Tag({ text, color }: Props) {
  return (
    <span
      className={`text-[0.68rem] font-medium px-2 py-0.5 rounded-full whitespace-nowrap select-text ${colorMap[color]}`}
    >
      {text}
    </span>
  );
}
