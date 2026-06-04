import { Sparkles } from "lucide-react";

interface BookingLogoProps {
  className?: string;
  showText?: boolean;
}

export function BookingLogo({ className = "", showText = true }: BookingLogoProps) {
  return (
    <div className={`p-0 flex items-center gap-3 ${className}`}>
      <div className="relative">
        <div className="relative bg-gradient-primary p-2 rounded-lg">
          <Sparkles className="w-6 h-6 text-white" />
        </div>
      </div>
      {showText && (
        <span className="text-2xl font-bold text-gradient">
          BookingFy
        </span>
      )}
    </div>
  );
}
