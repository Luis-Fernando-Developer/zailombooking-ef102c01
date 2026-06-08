import { BookingLogo } from "@/components/BookingLogo";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { 
  Instagram, 
  Twitter, 
  Linkedin, 
  Globe, 
  ShieldCheck, 
  ArrowUpRight 
} from "lucide-react";

export function Footer() {
  const currentYear = new Date().getFullYear();
  
  return (
    <footer className="bg-[#0B0D12] border-t border-white/5 pt-32 pb-16 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-20 mb-32">
          <div className="lg:col-span-1">
            <BookingLogo className="mb-10 scale-125 origin-left" />
            <p className="text-slate-500 font-medium leading-relaxed mb-10 max-w-xs">
              Defining the next generation of business management through superior engineering and cinematic design.
            </p>
            <div className="flex gap-6">
              {[Instagram, Twitter, Linkedin].map((Icon, i) => (
                <a key={i} href="#" className="w-10 h-10 rounded-xl border border-white/10 flex items-center justify-center text-slate-400 hover:text-white hover:border-white/40 transition-all">
                  <Icon className="w-5 h-5" />
                </a>
              ))}
            </div>
          </div>

          {[
            {
              title: "ecosystem",
              links: ["Architecture", "AI Engine", "Performance", "Security"]
            },
            {
              title: "experience",
              links: ["Pricing", "Private Demos", "Academy", "Support"]
            },
            {
              title: "collective",
              links: ["About Us", "Brand Story", "Manifesto", "Contact"]
            }
          ].map((column, i) => (
            <div key={i}>
              <h3 className="text-white text-[10px] font-black uppercase tracking-[0.5em] mb-10">{column.title}</h3>
              <ul className="space-y-6">
                {column.links.map((link, j) => (
                  <li key={j}>
                    <a href="#" className="text-slate-500 hover:text-white font-bold transition-all text-sm flex items-center group">
                      {link}
                      <ArrowUpRight className="w-3 h-3 ml-2 opacity-0 group-hover:opacity-100 -translate-y-1 translate-x-1 transition-all" />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="pt-16 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-10">
          <div className="flex items-center gap-12 text-[10px] font-black uppercase tracking-[0.3em] text-slate-600">
            <span className="flex items-center gap-2">
              <Globe className="w-3 h-3" /> HQ: London / UK
            </span>
            <span className="flex items-center gap-2">
              <ShieldCheck className="w-3 h-3" /> GDPR Compliant
            </span>
          </div>
          
          <div className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-600">
            © {currentYear} Zylo Ecosystem. Engineered for the Elite.
          </div>
        </div>
      </div>
    </footer>
  );
}
