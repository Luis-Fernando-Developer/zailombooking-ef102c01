import { useState, useEffect } from "react";
import type { User } from "@supabase/supabase-js";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { BusinessLayout } from "@/components/business/BusinessLayout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  CreditCard,
  FileText,
  Package,
  Loader2,
  Download,
  ExternalLink,
  Check,
  MessageSquare,
  CalendarClock,
  QrCode,
  Copy,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { usePermissions } from "@/hooks/use-permissions";
import { useToast } from "@/hooks/use-toast";
import {
  calculateSubscriptionChange,
  formatBRL,
  periodLabel,
  PLAN_PRICES,
} from "@/lib/proration";

type Plan = {
  id: string;
  name: string;
  monthly_price: number;
  quarterly_price: number;
  annual_price: number;
  builder_tier: string;
  features: any;
};

type Subscription = {
  id: string;
  company_id: string;
  plan_id: string;
  billing_period: string;
  status: string;
  billing_status?: string | null;
  paid_until?: string | null;
  original_price: number;
  next_billing_date: string | null;
  pending_plan_change: any;
  current_payment_method_id: string | null;
  asaas_subscription_id: string | null;
  subscription_plans: Plan;
};

type PaymentMethod = {
  id: string;
  type: string;
  brand: string | null;
  last_digits: string | null;
  display_label: string | null;
  is_default: boolean;
  is_active: boolean;
};

type Invoice = {
  id: string;
  amount: number;
  status: string;
  billing_type: string | null;
  due_date: string;
  paid_at: string | null;
  invoice_url: string | null;
  bank_slip_url: string | null;
  description: string | null;
  pix_payload?: string | null;
  pix_qr_code?: string | null;
};

type Limits = {
  max_employees: number | null;
  max_services: number | null;
  max_bookings_month: number | null;
  max_chatbots: number | null;
  max_chatbot_messages: number | null;
  max_integrations: number | null;
  max_whatsapp_instances: number | null;
  features: any;
};

export default function BillingManagement() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "plan";
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [company, setCompany] = useState<any>(null);
  const [subscription, setSubscription] =
    useState<Subscription | null>(null);
  const [allPlans, setAllPlans] = useState<Plan[]>([]);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [limits, setLimits] = useState<Limits | null>(null);

  const [changePlanOpen, setChangePlanOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string>("");
  const [selectedPeriod, setSelectedPeriod] =
    useState<string>("monthly");
  const [busy, setBusy] = useState(false);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const { hasPermission, loading: permissionsLoading } = usePermissions(company?.id, authUser);

  const [pixInvoice, setPixInvoice] =
    useState<Invoice | null>(null);

  const [docPrompt, setDocPrompt] = useState<{
    invoice: Invoice;
    billingType: "PIX" | "BOLETO";
  } | null>(null);

  const [docValue, setDocValue] = useState("");

  const [addCardOpen, setAddCardOpen] = useState(false);

  const [card, setCard] = useState({
    holderName: "",
    number: "",
    expiryMonth: "",
    expiryYear: "",
    ccv: "",
    cpfCnpj: "",
    postalCode: "",
    addressNumber: "",
    phone: "",
    email: "",
  });

  useEffect(() => {
    fetchAll();
  }, [slug]);

  /**
   * Somente estes estados representam uma invoice
   * que ainda pode ser paga.
   */
  function isInvoicePayable(status: string) {
    return ["pending", "overdue", "processing"].includes(
      String(status || "").toLowerCase()
    );
  }

  async function fetchAll() {
    setLoading(true);

    try {
      const { data: comp } = await supabase
        .from("companies")
        .select("*")
        .eq("slug", slug)
        .single();

      if (!comp) return;

      setCompany(comp);

      const [
        { data: sub },
        { data: plans },
        { data: pm },
        { data: inv },
      ] = await Promise.all([
        supabase
          .from("company_subscriptions")
          .select("*, subscription_plans(*)")
          .eq("company_id", comp.id)
          .maybeSingle(),

        supabase
          .from("subscription_plans")
          .select("*")
          .eq("is_active", true)
          .order("monthly_price"),

        supabase
          .from("company_payment_methods")
          .select("*")
          .eq("company_id", comp.id)
          .eq("is_active", true),

        supabase
          .from("company_invoices")
          .select("*")
          .eq("company_id", comp.id)
          .order("due_date", { ascending: false })
          .limit(50),
      ]);

      setSubscription(sub as any);
      setAllPlans((plans as any) || []);
      setMethods((pm as any) || []);
      setInvoices((inv as any) || []);

      const currentPlanName =
        sub?.subscription_plans?.name?.toLowerCase() ||
        "starter";

      const planResourceLimits: Record<string, Limits> = {
        starter: {
          max_bookings_month: 200,
          max_employees: 1,
          max_services: 5,
          max_chatbots: 1,
          max_whatsapp_instances: 1,
          max_chatbot_messages: 700,
          max_integrations: 1,
          features: {
            support: "Email",
          },
        },

        professional: {
          max_bookings_month: 700,
          max_employees: 5,
          max_services: 12,
          max_chatbots: 3,
          max_whatsapp_instances: 3,
          max_chatbot_messages: 5000,
          max_integrations: 1,
          features: {
            support: "Prioritário",
            reports: "Avançados",
          },
        },

        enterprise: {
          max_bookings_month: -1,
          max_employees: -1,
          max_services: -1,
          max_chatbots: -1,
          max_whatsapp_instances: -1,
          max_chatbot_messages: -1,
          max_integrations: -1,
          features: {
            support: "Gerente de conta dedicado",
            api: "Completa",
          },
        },
      };

      setLimits(
        planResourceLimits[currentPlanName] ||
          planResourceLimits.starter
      );

      if (sub) {
        setSelectedPlan(sub.plan_id);
        setSelectedPeriod(
          sub.billing_period || "monthly"
        );
      }
    } catch (e: any) {
      console.error(e);

      toast({
        title: "Erro ao carregar dados",
        description: e.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  async function callFn(name: string, body: any) {
    const { data, error } =
      await supabase.functions.invoke(name, {
        body,
      });

    if (error) {
      throw new Error(error.message);
    }

    if ((data as any)?.error) {
      throw new Error((data as any).error);
    }

    return data;
  }

  /**
   * Notificação específica de assinatura.
   *
   * IMPORTANTE:
   * Não utiliza notify-booking-event.
   *
   * Essa função é best-effort:
   * se o WhatsApp falhar, a cobrança continua normalmente.
   */
  async function notifySubscriptionEvent(
    invoiceId: string
  ) {
    if (!invoiceId) return;

    try {
      const { data, error } =
        await supabase.functions.invoke(
          "notify-subscription-event",
          {
            body: {
              invoice_id: invoiceId,
              event_key:
                "subscription_invoice_pending",
            },
          }
        );

      if (error) {
        console.warn(
          "[BillingManagement] Falha ao enviar notificação da assinatura:",
          error
        );

        return;
      }

      if ((data as any)?.error) {
        console.warn(
          "[BillingManagement] Notificação da assinatura retornou erro:",
          data
        );
      }
    } catch (error) {
      console.warn(
        "[BillingManagement] Erro ao notificar invoice de assinatura:",
        error
      );
    }
  }

  /**
   * Gera ou reaproveita a cobrança da fatura
   * de assinatura no Asaas.
   */
  async function handleGenerateCharge(
    invoice: Invoice,
    billingType: "PIX" | "BOLETO" = "PIX",
    cpfCnpj?: string
  ) {
    if (!isInvoicePayable(invoice.status)) {
      toast({
        title: "Fatura não disponível para pagamento",
        description:
          "Esta fatura não está mais pendente de pagamento.",
        variant: "destructive",
      });

      return;
    }

    setBusy(true);

    try {
      const { data, error } =
        await supabase.functions.invoke(
          "subscription-create-charge",
          {
            body: {
              invoice_id: invoice.id,
              billing_type: billingType,
              ...(cpfCnpj
                ? {
                    cpf_cnpj:
                      cpfCnpj.replace(/\D/g, ""),
                  }
                : {}),
            },
          }
        );

      if (error) {
        throw new Error(error.message);
      }

      const result: any = data;

      if (result?.code === "cpf_required") {
        setDocValue("");

        setDocPrompt({
          invoice,
          billingType,
        });

        return;
      }

      if (result?.error) {
        throw new Error(result.error);
      }

      setDocPrompt(null);

      const notificationInvoiceId =
        result?.invoice_id || invoice.id;

      /*
       * A cobrança foi criada/reaproveitada com sucesso.
       * A notificação não pode quebrar o fluxo.
       */
      await notifySubscriptionEvent(
        notificationInvoiceId
      );

      await fetchAll();

      if (
        billingType === "PIX" &&
        result?.pix_payload
      ) {
        setPixInvoice({
          ...invoice,
          id: notificationInvoiceId,
          pix_payload: result.pix_payload,
          pix_qr_code: result.pix_qr_code,
        });
      } else if (result?.invoice_url) {
        window.open(
          result.invoice_url,
          "_blank",
          "noopener,noreferrer"
        );
      }

      toast({
        title: "Cobrança gerada",
        description:
          "A fatura já pode ser paga.",
      });
    } catch (e: any) {
      toast({
        title: "Erro ao gerar cobrança",
        description: e.message,
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleChangePlan() {
    if (!hasPermission("subscription.manage")) return;
    if (!subscription || !selectedPlan) return;

    setBusy(true);

    try {
      const result: any = await callFn(
        "asaas-change-plan",
        {
          company_id:
            subscription.company_id,
          new_plan_id: selectedPlan,
          billing_period: selectedPeriod,
        }
      );

      const nextDate = formatDate(
        result.next_billing_date
      );

      if (
        result?.immediate &&
        result?.applied
      ) {
        toast({
          title: "Upgrade aplicado",
          description:
            result.proration_amount
              ? `Cobrança de proração de ${formatBRL(
                  result.proration_amount
                )} confirmada no cartão.`
              : "Novo plano já está ativo.",
        });
      } else if (
        result?.immediate &&
        result?.pix_payload
      ) {
        const invoiceId =
          result.invoice_id;

        setPixInvoice({
          id: invoiceId,
          amount:
            result.proration_amount,
          status: "pending",
          billing_type: "PIX",
          due_date:
            new Date().toISOString(),
          paid_at: null,
          invoice_url:
            result.invoice_url ?? null,
          bank_slip_url: null,
          description:
            "Proração do upgrade de plano",
          pix_payload:
            result.pix_payload,
          pix_qr_code:
            result.pix_qr_code,
        });

        if (invoiceId) {
          await notifySubscriptionEvent(
            invoiceId
          );
        }

        toast({
          title:
            "Pague a proração para ativar",
          description: `O upgrade é liberado assim que o PIX de ${formatBRL(
            result.proration_amount
          )} for confirmado.`,
        });
      } else {
        toast({
          title: "Alteração agendada",
          description: `O novo plano será aplicado após o término do período atual. Próxima cobrança: ${nextDate}`,
        });
      }

      setChangePlanOpen(false);

      await fetchAll();
    } catch (e: any) {
      toast({
        title: "Erro",
        description: e.message,
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleSetMethodPix() {
    if (!hasPermission("subscription.manage")) return;
    if (!company) return;

    setBusy(true);

    try {
      await callFn(
        "asaas-set-payment-method",
        {
          company_id: company.id,
          type: "pix",
        }
      );

      toast({
        title:
          "PIX definido como método padrão",
      });

      await fetchAll();
    } catch (e: any) {
      toast({
        title: "Erro",
        description: e.message,
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleAddCard() {
    if (!company) return;

    setBusy(true);

    try {
      await callFn(
        "asaas-set-payment-method",
        {
          company_id: company.id,
          type: "credit_card",

          credit_card: {
            holderName:
              card.holderName,
            number:
              card.number.replace(
                /\s/g,
                ""
              ),
            expiryMonth:
              card.expiryMonth,
            expiryYear:
              card.expiryYear,
            ccv: card.ccv,
          },

          credit_card_holder_info: {
            name: card.holderName,
            email:
              card.email ||
              company.owner_email,
            cpfCnpj:
              card.cpfCnpj,
            postalCode:
              card.postalCode,
            addressNumber:
              card.addressNumber,
            phone:
              card.phone ||
              company.owner_phone,
          },
        }
      );

      toast({
        title: "Cartão adicionado",
      });

      setAddCardOpen(false);

      await fetchAll();
    } catch (e: any) {
      toast({
        title: "Erro",
        description: e.message,
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  if (loading || permissionsLoading) {
    return (
      <BusinessLayout companySlug={slug || ""} companyName="Carregando..." companyId="" userRole="loading">
        <div className="flex items-center justify-center h-64">Carregando...</div>
      </BusinessLayout>
    );
  }

  if (!hasPermission("subscription.view") && !hasPermission("subscription.manage")) {
    return (
      <BusinessLayout companySlug={slug || ""} companyName={company?.name || "Acesso Negado"} companyId={company?.id || ""} userRole="unauthorized">
        <div className="flex items-center justify-center h-64 text-center">
          <div><h2 className="text-2xl font-bold text-destructive">Acesso Negado</h2><p className="text-muted-foreground">Você não tem permissão para acessar o gerenciamento do plano.</p></div>
        </div>
      </BusinessLayout>
    );
  }
