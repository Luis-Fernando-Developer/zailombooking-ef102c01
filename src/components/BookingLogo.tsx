interface BookingLogoProps {
  className?: string;
  showText?: boolean;
}

export function BookingLogo({ className = "", showText = true }: BookingLogoProps) {
  return (
    <div className={`p-0 flex items-center gap-3 ${className}`}>
      <div className="relative">
        <img src="/logo_zylo.svg" alt="Zailom Logo" className="w-10 h-10 object-contain" />
      </div>
      {showText && (
        <img src="/brand_name_zailom_booking.svg" alt="Zailom Booking" className="h-8 object-contain" />
      )}
    </div>
  );
}
