import { motion } from "framer-motion";
import { Cpu, Layout, BarChart3, Users, Zap, Sparkles, Box, ShieldCheck } from "lucide-react";

export function Features() {
  const features = [
    {
      title: "Hyper-Performance Engine",
      description: "Latency is eliminated. Our core architecture processes data at the speed of thought, ensuring your client experience is never interrupted.",
      icon: Cpu,
      gradient: "from-blue-600/20 to-cyan-500/10"
    },
    {
      title: "Cinematic Visuals",
      description: "Every pixel is engineered for beauty. A scheduling interface so elegant that it doesn't just work—it inspires confidence and desire.",
      icon: Layout,
      gradient: "from-purple-600/20 to-pink-500/10"
    },
    {
      title: "Advanced AI Predictive",
      description: "Our proprietary AI doesn't just schedule; it predicts. It optimizes your workflow and revenue streams before you even open your laptop.",
      icon: Sparkles,
      gradient: "from-amber-600/20 to-orange-500/10"
    },
    {
      title: "Enterprise Multi-Node",
      description: "Manage multiple locations, teams, and complex operations from a single command center with zero friction.",
      icon: Box,
      gradient: "from-emerald-600/20 to-teal-500/10"
    }
  ];

  return (
    <section className="section-padding bg-[#0B0D12] relative overflow-hidden">
      {/* Structural Decor */}
      <div className="absolute inset-0 z-0 pointer-events-none opacity-20">
        <div className="absolute top-[20%] right-[-10%] w-[500px] h-[500px] bg-primary/10 blur-[150px] rounded-full" />
        <div className="absolute bottom-[-10%] left-[-5%] w-[400px] h-[400px] bg-accent/10 blur-[120px] rounded-full" />
      </div>

      <div className="max-w-7xl mx-auto relative z-10">
        <div className="grid lg:grid-cols-2 gap-24 items-center mb-32">
          <div>
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="text-primary text-[10px] font-black uppercase tracking-[0.5em] mb-8"
            >
              The Architecture of Value
            </motion.div>
            <motion.h2 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-5xl md:text-7xl font-black text-white tracking-tighter leading-[0.9] mb-10"
            >
              ENGINEERED FOR <br />
              <span className="text-highlight">LÉGITIMATE POWER.</span>
            </motion.h2>
            <p className="text-xl text-slate-400 font-medium leading-relaxed max-w-lg">
              We don't build software. We build instruments of growth for brands that refuse to be categorized as "just another business."
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {features.map((f, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="premium-glass p-8 rounded-[2rem] group hover:border-primary/40 transition-all duration-500"
              >
                <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${f.gradient} border border-white/5 flex items-center justify-center mb-8 group-hover:scale-110 transition-transform duration-500`}>
                  <f.icon className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-xl font-black text-white mb-4 tracking-tight">{f.title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed font-medium">
                  {f.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Cinematic Stats/Proof Area */}
        <div className="premium-glass rounded-[3rem] p-12 md:p-20 flex flex-wrap justify-between gap-12 border-white/5">
          {[
            { label: "Execution Speed", value: "0.4ms" },
            { label: "Active Enterprises", value: "2,480" },
            { label: "Total Transactions", value: "$4.2B+" },
            { label: "Reliability Rate", value: "99.99%" }
          ].map((stat, i) => (
            <div key={i} className="flex-1 min-w-[200px] text-center lg:text-left">
              <p className="text-5xl font-black text-white tracking-tighter mb-2 group cursor-default">
                {stat.value}
              </p>
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
