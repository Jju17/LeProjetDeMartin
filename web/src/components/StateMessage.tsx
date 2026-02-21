interface Props {
  icon?: string;
  title: string;
  detail?: string;
  onRetry?: () => void;
}

export default function StateMessage({ icon, title, detail, onRetry }: Props) {
  return (
    <div className="text-center py-12 px-4 text-gray-400">
      {icon && <p className="text-3xl mb-2">{icon}</p>}
      <p className="font-semibold text-gray-500">{title}</p>
      {detail && <p className="text-sm mt-1">{detail}</p>}
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-3 px-5 py-2 border border-blue-500 text-blue-500 rounded-lg text-sm hover:bg-blue-50 transition-colors"
        >
          R&eacute;essayer
        </button>
      )}
    </div>
  );
}

export function Spinner({ text }: { text: string }) {
  return (
    <div className="text-center py-12 text-gray-400">
      <div className="w-6 h-6 border-3 border-gray-200 border-t-blue-500 rounded-full animate-spin mx-auto mb-3" />
      <p className="text-sm">{text}</p>
    </div>
  );
}
