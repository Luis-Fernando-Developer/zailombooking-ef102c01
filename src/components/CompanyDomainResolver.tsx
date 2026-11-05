import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";

const RESERVED_HOSTS = new Set([
  "zailom.com", "www.zailom.com", "booking.zailom.com", "fallback.zailom.com",
  "flow.zailom.com", "api-flowbuilder.zailom.com", "wa.zailom.com",
  "localhost", "127.0.0.1",
]);

/**
 * Resolves company subdomains to the existing slug-based route structure.
 * The slug remains in the path so all current routes, params, links and auth
 * redirects continue to work. A URL-preserving router migration is required
 * before removing this redirect.
 */
export function CompanyDomainResolver() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const host = window.location.hostname.toLowerCase();
    if (
      RESERVED_HOSTS.has(host) ||
      host.endsWith(".vercel.app") ||
      host.endsWith(".lovable.app")
    ) return;

    let cancelled = false;
    supabase.rpc("resolve_company_slug_by_host", { p_host: host }).then(({ data, error }) => {
      if (cancelled || error || typeof data !== "string" || !data) return;
      const companyPath = `/${data}`;
      if (location.pathname === companyPath || location.pathname.startsWith(companyPath + "/")) return;
      const nextPath = location.pathname === "/" ? companyPath : `${companyPath}${location.pathname}`;
      navigate(nextPath + location.search + location.hash, { replace: true });
    }).catch((error) => {
      console.error("Falha ao resolver subdomínio da empresa:", error);
    });

    return () => { cancelled = true; };
  }, [location.pathname, location.search, location.hash, navigate]);

  return null;
}
