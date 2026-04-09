import { cn } from '../lib/utils';

interface MapboxFallbackProps {
  className?: string;
  message?: string;
}

export default function MapboxFallback({
  className,
  message = 'Falta configurar Mapbox',
}: MapboxFallbackProps) {
  return (
    <div className={cn(
      'flex min-h-[240px] w-full items-center justify-center rounded-xl border bg-gray-100 text-sm text-gray-600',
      className
    )}
    >
      {message}
    </div>
  );
}
