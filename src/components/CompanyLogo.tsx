import { useState, useEffect } from "react";
import { BookingLogo } from "./BookingLogo";
import { supabase } from "@/lib/supabaseClient";

interface CompanyLogoProps {
  companySlug: string;
  showText?: boolean;
  className?: string;
}

interface Company {
  id: string;
  name: string;
  customizations?: {
    logo_type: string;
    logo_url: string;
    logo_upload_path: string;
  } | null;
}

export function CompanyLogo({ companySlug, showText = true, className }: CompanyLogoProps) {
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (companySlug) {
      fetchCompanyLogo();
    }
  }, [companySlug]);

  const fetchCompanyLogo = async () => {
    try {
      const { data, error } = await supabase
        .from("companies")
        .select(`
          id,
          name,
          company_customizations(
            logo_type,
            logo_url,
            logo_upload_path
          )
        `)
        .eq("slug", companySlug)
        .eq("status", "active")
        .maybeSingle();

      if (error) throw error;

      if (data) {
        const customization = Array.isArray(data.company_customizations)
          ? data.company_customizations[0] || null
          : data.company_customizations || null;

        setCompany({
          id: data.id,
          name: data.name,
          customizations: customization,
        });
      } else {
        setCompany(null);
      }
    } catch (error) {
      console.error("Error fetching company logo:", error);
      setCompany(null);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="w-8 h-8 bg-muted animate-pulse rounded" />;
  }

  if (!company || !company.customizations) {
    return <BookingLogo showText={showText} className={className} />;
  }

  const { logo_type, logo_url, logo_upload_path } = company.customizations;

  let logoSrc = "";
  if (logo_type === "url" && logo_url) {
    logoSrc = logo_url;
  } else if (logo_type === "upload" && logo_upload_path) {
    const { data } = supabase.storage
      .from("company-logos")
      .getPublicUrl(logo_upload_path);
    logoSrc = data.publicUrl;
  }

  if (!logoSrc) {
    if (showText && company.name) {
      return (
        <div className={`font-bold text-lg text-primary ${className}`}>
          {company.name}
        </div>
      );
    }
    return <BookingLogo showText={showText} className={className} />;
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <img
        src={logoSrc}
        alt={`${company.name} logo`}
        className="h-8 w-auto object-contain"
        onError={(e) => {
          e.currentTarget.style.display = "none";
          e.currentTarget.nextElementSibling?.classList.remove("hidden");
        }}
      />
      <BookingLogo showText={showText} className="hidden" />
      {showText && (
        <span className="font-semibold text-primary">{company.name}</span>
      )}
    </div>
  );
}
