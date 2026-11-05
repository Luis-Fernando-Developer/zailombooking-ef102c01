import { ReactNode, useEffect, useMemo, useState } from "react";
import { Router, createPath, parsePath } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";

const RESERVED_HOSTS = new Set([
  "zailom.com", "www.zailom.com", "booking.zailom.com",
  "flow-builder.zailom.com", "api-flowbuilder.zailom.com", "wa.zailom.com",
  "localhost", "127.0.0.1",
]);

const GLOBAL_PATHS = [
  "/signup", "/api-docs", "/api-reference", "/reset-password",
  "/reset-owner-password", "/super-admin", "/confirmar-vincular",
  "/confirmar-empresa",
];

type RouterLocation = { pathname: string; search: string; hash: string; state: unknown; key: string };

function isGlobalPath(pathname: string) {
  return GLOBAL_PATHS.some((path) => pathname === path || pathname.startsWith(path + "/"));
}
function toVirtualPath(pathname: string, slug: string | null) {
  if (!slug || isGlobalPath(pathname)) return pathname;
  if (pathname === "/") return `/${slug}`;
  if (pathname === `/${slug}` || pathname.startsWith(`/${slug}/`)) return pathname;
  return `/${slug}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
}
function toBrowserPath(pathname: string, slug: string | null) {
  if (!slug) return pathname;
  if (pathname === `/${slug}`) return "/";
  if (pathname.startsWith(`/${slug}/`)) return pathname.slice(slug.length + 1) || "/";
  return pathname;
}
function makeLocation(pathname: string, search = "", hash = "", state: unknown = null, key = "default"): RouterLocation {
  return { pathname: pathname || "/", search, hash, state, key };
}

export function CompanyAwareRouter({ children }: { children: ReactNode }) {
  const [companySlug, setCompanySlug] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [location, setLocation] = useState<RouterLocation>(() => {
    const parsed = parsePath(window.location.pathname + window.location.search + window.location.hash);
    return makeLocation(parsed.pathname || "/", parsed.search, parsed.hash, window.history.state?.usr, window.history.state?.key || "default");
  });

  useEffect(() => {
    let cancelled = false;
    const host = window.location.hostname.toLowerCase();
    if (RESERVED_HOSTS.has(host) || host.endsWith(".vercel.app") || host.endsWith(".lovable.app")) {
      setReady(true);
      return () => { cancelled = true; };
    }

    supabase.rpc("resolve_company_slug_by_host", { p_host: host }).then(({ data, error }) => {
      if (cancelled) return;
      if (error) console.error("Falha ao resolver subdomínio da empresa:", error);

      // O hostname dedicado já identifica a empresa. O slug retornado pelo banco é
      // preferível; o fallback mantém o login acessível caso a RPC esteja indisponível.
      const hostnameSlug = host.endsWith(".zailom.com") ? host.split(".")[0] : null;
      const slug = !error && typeof data === "string" && data
        ? data
        : hostnameSlug && !hostnameSlug.startsWith("flow-") ? hostnameSlug : null;

      setCompanySlug(slug);
      const parsed = parsePath(window.location.pathname + window.location.search + window.location.hash);
      const virtualPath = toVirtualPath(parsed.pathname || "/", slug);
      const browserPath = toBrowserPath(virtualPath, slug);
      if (slug && browserPath !== (parsed.pathname || "/")) {
        window.history.replaceState(window.history.state, "", createPath({ pathname: browserPath, search: parsed.search, hash: parsed.hash }));
      }
      setLocation(makeLocation(virtualPath, parsed.search, parsed.hash, window.history.state?.usr, window.history.state?.key || "default"));
      setReady(true);
    }).catch((error) => {
      if (cancelled) return;
      console.error("Falha ao consultar subdomínio:", error);
      const hostnameSlug = host.endsWith(".zailom.com") ? host.split(".")[0] : null;
      const slug = hostnameSlug && !hostnameSlug.startsWith("flow-") ? hostnameSlug : null;
      setCompanySlug(slug);
      const parsed = parsePath(window.location.pathname + window.location.search + window.location.hash);
      const virtualPath = toVirtualPath(parsed.pathname || "/", slug);
      setLocation(makeLocation(virtualPath, parsed.search, parsed.hash, window.history.state?.usr, window.history.state?.key || "default"));
      setReady(true);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const handlePopState = () => {
      const parsed = parsePath(window.location.pathname + window.location.search + window.location.hash);
      setLocation(makeLocation(toVirtualPath(parsed.pathname || "/", companySlug), parsed.search, parsed.hash, window.history.state?.usr, window.history.state?.key || "default"));
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [ready, companySlug]);

  const navigator = useMemo(() => ({
    createHref(to: any) {
      const parsed = parsePath(createPath(to));
      return createPath({ ...parsed, pathname: toBrowserPath(parsed.pathname || "/", companySlug) });
    },
    encodeLocation(to: any) {
      const pathname = typeof to?.pathname === "string" ? to.pathname : "/";
      const search = typeof to?.search === "string" ? to.search : "";
      const hash = typeof to?.hash === "string" ? to.hash : "";
      return {
        pathname: pathname.startsWith("/") ? pathname : `/${pathname}`,
        search: search && !search.startsWith("?") ? `?${search}` : search,
        hash: hash && !hash.startsWith("#") ? `#${hash}` : hash,
      };
    },
    go(delta: number) { window.history.go(delta); },
    push(to: any, state?: any) {
      const parsed = parsePath(createPath(to));
      const virtualPath = toVirtualPath(parsed.pathname || "/", companySlug);
      const key = Math.random().toString(36).slice(2, 10);
      window.history.pushState({ usr: state, key }, "", createPath({ ...parsed, pathname: toBrowserPath(virtualPath, companySlug) }));
      setLocation(makeLocation(virtualPath, parsed.search, parsed.hash, state, key));
    },
    replace(to: any, state?: any) {
      const parsed = parsePath(createPath(to));
      const virtualPath = toVirtualPath(parsed.pathname || "/", companySlug);
      const key = window.history.state?.key || "default";
      window.history.replaceState({ usr: state, key }, "", createPath({ ...parsed, pathname: toBrowserPath(virtualPath, companySlug) }));
      setLocation(makeLocation(virtualPath, parsed.search, parsed.hash, state, key));
    },
  }), [companySlug]);

  if (!ready) return null;
  return <Router location={location as any} navigationType="POP" navigator={navigator as any}>{children}</Router>;
}
