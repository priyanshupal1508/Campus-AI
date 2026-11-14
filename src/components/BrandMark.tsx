interface BrandMarkProps {
  onClick?: () => void;
  inverted?: boolean;
}

export function BrandMark({ onClick, inverted = false }: BrandMarkProps) {
  const content = (
    <span className="inline-flex items-center gap-2.5 whitespace-nowrap shrink-0">
      <svg
        width="28"
        height="28"
        viewBox="0 0 28 28"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="shrink-0"
      >
        <rect
          width="28"
          height="28"
          rx="7"
          fill={inverted ? '#FFFFFF' : '#1D4ED8'}
        />
        <path
          d="M14 6.5L21 10L14 13.5L7 10L14 6.5Z"
          fill={inverted ? '#1D4ED8' : '#FFFFFF'}
        />
        <path
          d="M9.5 12.25V17.25C9.5 18.77 11.51 20 14 20C16.49 20 18.5 18.77 18.5 17.25V12.25L14 14.5L9.5 12.25Z"
          fill={inverted ? '#1D4ED8' : '#FFFFFF'}
          fillOpacity="0.88"
        />
        <path
          d="M20.5 11.25V16.75"
          stroke={inverted ? '#1D4ED8' : '#FFFFFF'}
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
      <span
        className={`font-display text-lg font-bold tracking-tight ${
          inverted ? 'text-white' : 'text-slate-900'
        }`}
      >
        CampusAI
      </span>
    </span>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="inline-flex items-center rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 whitespace-nowrap shrink-0 cursor-pointer"
      >
        {content}
      </button>
    );
  }

  return content;
}
