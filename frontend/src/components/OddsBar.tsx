import clsx from 'clsx';

interface OddsBarProps {
  yesPercent: number;
  noPercent: number;
  size?: 'sm' | 'md' | 'lg';
  showLabels?: boolean;
}

export function OddsBar({
  yesPercent,
  noPercent,
  size = 'md',
  showLabels = true,
}: OddsBarProps) {
  const height = { sm: 'h-1.5', md: 'h-2', lg: 'h-3' }[size];
  const textSize = { sm: 'text-xs', md: 'text-sm', lg: 'text-base' }[size];

  return (
    <div className="w-full">
      {showLabels && (
        <div className={clsx('mb-1.5 flex justify-between font-semibold', textSize)}>
          <span className="text-yes">YES {yesPercent}%</span>
          <span className="text-no">NO {noPercent}%</span>
        </div>
      )}
      <div className={clsx('flex w-full overflow-hidden rounded-full', height)}>
        <div
          className="bg-yes transition-all duration-500"
          style={{ width: `${yesPercent}%` }}
        />
        <div
          className="bg-no flex-1 transition-all duration-500"
          style={{ width: `${noPercent}%` }}
        />
      </div>
    </div>
  );
}
