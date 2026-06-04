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
  };
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
        .from('companies')
        .select(`
          id,
          name,
          company_customizations!inner(
            logo_type,
            logo_url,
            logo_upload_path
          )
        `)
        .eq('slug', companySlug)
        .eq('status', 'active')
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      if (data) {
        setCompany({
          id: data.id,
          name: data.name,
          customizations: data.company_customizations?.[0] || null
        });
      }
    } catch (error) {
      console.error('Error fetching company logo:', error);
      // Fallback to system logo
      setCompany(null);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="w-8 h-8 bg-muted animate-pulse rounded" />;
  }

  // If no company data or no customization, use system logo
  if (!company || !company.customizations) {
    return <BookingLogo showText={showText} className={className} />;
  }

  const { logo_type, logo_url, logo_upload_path } = company.customizations;

  // Determine logo source
  let logoSrc = '';
  if (logo_type === 'url' && logo_url) {
    logoSrc = logo_url;
  } else if (logo_type === 'upload' && logo_upload_path) {
    const { data } = supabase.storage
      .from('company-logos')
      .getPublicUrl(logo_upload_path);
    logoSrc = data.publicUrl;
  }

  // If no logo configured, show company name or system logo
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
          // Fallback to system logo if image fails to load
          e.currentTarget.style.display = 'none';
          e.currentTarget.nextElementSibling?.classList.remove('hidden');
        }}
      />
      <BookingLogo showText={showText} className="hidden" />
      {showText && (
        <span className="font-semibold text-primary">{company.name}</span>
      )}
    </div>
  );
}