import { Hero } from "@/components/landing/Hero";
import { Features } from "@/components/landing/Features";
import { WhyUs } from "@/components/landing/WhyUs";
import { SocialProof } from "@/components/landing/SocialProof";
import { Pricing } from "@/components/landing/Pricing";
import { CTAFinal } from "@/components/landing/CTAFinal";
import { Footer } from "@/components/landing/Footer";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <Hero />
      <WhyUs />
      <Features />
      <SocialProof />
      <Pricing />
      <CTAFinal />
      <Footer />
    </div>
  );
}