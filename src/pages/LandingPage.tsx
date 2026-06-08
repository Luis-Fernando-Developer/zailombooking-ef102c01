import { Hero } from "@/components/landing/Hero";
import { TargetAudience } from "@/components/landing/TargetAudience";
import { Features } from "@/components/landing/Features";
import { WhyUs } from "@/components/landing/WhyUs";
import { Steps } from "@/components/landing/Steps";
import { SocialProof } from "@/components/landing/SocialProof";
import { Pricing } from "@/components/landing/Pricing";
import { FAQ } from "@/components/landing/FAQ";
import { CTAFinal } from "@/components/landing/CTAFinal";
import { Footer } from "@/components/landing/Footer";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <Hero />
      <TargetAudience />
      <WhyUs />
      <Steps />
      <Features />
      <SocialProof />
      <Pricing />
      <FAQ />
      <CTAFinal />
      <Footer />
    </div>
  );
}