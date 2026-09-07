import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, QrCode, CreditCard, Receipt, CheckCircle2, Copy } from "lucide-react";

interface BookingData {
  company_id: string;
  employee_id: string;
  service_id?: string;
  combo_id?: string;
  booking_time: string;
  start_time: string;
  end_time: string;
  booking_date: string;
  duration_minutes: number;
  price: number;
  notes?: string;
  client_id: string;
  booking_status?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  bookingId?: string;
  companyId: string;
  amount: number;
  payerInitial: { name: string; email?: string; phone?: string; cpf_cnpj?: string };
  onPaid: () => void;
  allowPayLater?: boolean;
  onPayLater?: () => void;
  /** Dados para criar booking novo quando bookingId não é fornecido */
  bookingData?: BookingData;
}

const ICON: Record<string, any> = { PIX: QrCode, CREDIT_CARD: CreditCard, DEBIT_CARD: CreditCard, BOLETO: Receipt };
const LABEL: Record<string, string> = { PIX: "PIX", CREDIT_CARD: "Cartão de Crédito", DEBIT_CARD: "Cartão de Débito", BOLETO: "Boleto" };
const KEY_TO_METHOD: Record<string, string> = { pix: "PIX", credit_card: "CREDIT_CARD", debit_card: "DEBIT_CARD", boleto: "BOLETO" };

export function BookingPaymentDialog({ open, onClose, bookingId, companyId, amount, payerInitial, onPaid, allowPayLater, onPayLater, bookingData }: Props) {
  const { toast } = useToast();
  const [methods, setMethods] = useState<string[]>([]);
  const [selected, setSelected] = useState<string>("PIX");
  const [payer, setPayer] = useState(payerInitial);
  const [loading, setLoading] = useState(false);
  const [payment, setPayment] = useState<any>(null);
  const [isPaid, setIsPaid] = useState(false);
  const [activeBookingId, setActiveBookingId] = useState<string | undefined>(bookingId);

  // Mantém activeBookingId em sync com prop
  useEffect(() => {
    if (bookingId) setActiveBookingId(bookingId);
  }, [bookingId]);

  useEffect(() => {
    if (!open) return;
    setActiveBookingId(bookingId);
    (async () => {
      const { data } = await supabase
        .from("company_payment_settings")
        .select("accepted_methods,payment_mode")
        .eq("company_id", companyId)
        .maybeSingle();
      if (!data || data.payment_mode === "none") { setMethods([]); return; }
      const acc = (data.accepted_methods || {}) as Record<string, boolean>;
      const list = Object.entries(acc).filter(([, v]) => v).map(([k]) => KEY_TO_METHOD[k]).filter(Boolean);
      setMethods(list);
      if (list.length) setSelected(list[0]);
    })();
  }, [open, companyId]);

  useEffect(() => {
    // if (!activeBookingId || isPaid || !open) return;
    if (!payment?.id || isPaid || !open) return;

    let isSubscribed = true;
    let tick = 0;

    const confirm = () => {
      isSubscribed = false;
      clearInterval(t);
      setIsPaid(true);
      onPaid();
      toast({ title: "Pagamento confirmado!", description: "Seu agendamento foi validado." });
      setTimeout(() => onClose(), 3000);
    };

    const t = setInterval(async () => {
      if (!isSubscribed) return;
      tick += 1;

      try {
        // const { data, error } = await supabase.rpc("check_booking_payment_status", {
        //   _booking_id: activeBookingId,
        // });
        const { data: remote } = await supabase.functions.invoke("booking-payment-status", {
          body: {
            payment_id: payment?.id,
          },
        });

        if (!error && (data as any)?.is_paid) {
          console.log("[PAYMENT_DIALOG] PAYMENT CONFIRMED (db)");
          await supabase.rpc("update_booking_payment_confirmed", { _booking_id: activeBookingId }).catch((e) => {
            console.error("[PAYMENT_DIALOG] Failed to update booking status:", e);
          });
          confirm();
          return;
        }
        if (error) console.error("[PAYMENT_DIALOG] RPC Error:", error);

        if (tick % 3 === 0) {
          const { data: remote } = await supabase.functions.invoke("booking-payment-status", {
            body: { booking_id: activeBookingId },
          });
          if ((remote as any)?.is_paid) {
            console.log("[PAYMENT_DIALOG] PAYMENT CONFIRMED (gateway)");
            await supabase.rpc("update_booking_payment_confirmed", { _booking_id: activeBookingId }).catch((e) => {
              console.error("[PAYMENT_DIALOG] Failed to update booking status:", e);
            });
            confirm();
          }
        }
      } catch (err) {
        console.error("[PAYMENT_DIALOG] Poll exception:", err);
      }
    }, 2000);

    return () => {
      isSubscribed = false;
      clearInterval(t);
    };
  // }, [activeBookingId, isPaid, open]);
  }, [payment?.id, isPaid, open]);

  /**
   * Cria o booking via admin-create-booking (quando ainda não existe).
   * Retorna o ID do booking criado.
   */
  async function createBooking(): Promise<string> {
    if (!bookingData) throw new Error("bookingData é necessário para criar o booking");

    // Validação defensiva dos campos obrigatórios
    const required: (keyof BookingData)[] = ['company_id', 'client_id', 'employee_id', 'booking_date', 'booking_time'];
    const missing = required.filter((f) => !bookingData[f]);
    if (missing.length) {
      throw new Error(`Campos obrigatórios faltando no bookingData: ${missing.join(', ')}`);
    }

    // Calcula start_time e end_time em ISO se não vierem prontos
    const rawTime = (bookingData.start_time || bookingData.booking_time || '00:00:00').toString().slice(0, 8);
    const datePart = bookingData.booking_date;
    const startTs = `${datePart}T${rawTime}:00-03:00`;
    const duration = Number(bookingData.duration_minutes) || 60;
    const endTs = new Date(new Date(startTs).getTime() + duration * 60000).toISOString();

    const { data, error } = await supabase.functions.invoke("admin-create-booking", {
      method: "POST",
      body: {
        company_id: bookingData.company_id,
        company_slug: bookingData.company_slug || "",
        service_id: bookingData.service_id || null,
        combo_id: bookingData.combo_id || null,
        employee_id: bookingData.employee_id,
        booking_date: bookingData.booking_date,
        booking_time: bookingData.booking_time,
        start_time: startTs,
        end_time: endTs,
        duration_minutes: bookingData.duration_minutes,
        price: bookingData.price,
        client_id: bookingData.client_id,
        notes: bookingData.notes || "",
        booking_status: bookingData.booking_status || "pending",
      },
    });

    if (error) throw new Error(error.message || "Erro ao criar agendamento");
    if ((data as any)?.error) throw new Error((data as any).error);

    const bookingId = (data as any)?.booking_id || (data as any)?.id;
    if (!bookingId) throw new Error("admin-create-booking não retornou booking_id");
    return bookingId;
  }

  async function generate() {
    setLoading(true);
    try {
      // let currentBookingId = activeBookingId;
      // if (!currentBookingId) {
      //   currentBookingId = await createBooking();
      //   setActiveBookingId(currentBookingId);
      //   console.log("[PAYMENT_DIALOG] Booking criado:", currentBookingId);
      // }

      const { data, error } = await supabase.functions.invoke("booking-create-payment", {
        // body: { booking_id: currentBookingId, method: selected, payer, amount },
        body: {
          booking_id: null,
          company_id: companyId,
          method: selected,
          payer,
          amount,
          booking_data: bookingData,
        },
      });
      if (error) throw new Error(error.message || "Erro ao gerar pagamento");
      if ((data as any)?.error) throw new Error((data as any).error);
      setPayment((data as any).payment);
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Pagamento do agendamento</DialogTitle>
          <DialogDescription>Valor: <strong>R$ {amount.toFixed(2)}</strong></DialogDescription>
        </DialogHeader>

        {isPaid ? (
          <div className="py-8 flex flex-col items-center justify-center space-y-4 text-center">
            <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center">
              <CheckCircle2 className="w-10 h-10 text-green-500" />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-semibold text-green-500">Pagamento concluído!</h3>
              <p className="text-sm text-muted-foreground">
                Seu agendamento foi confirmado com sucesso.
                <br />
                Redirecionando...
              </p>
            </div>
          </div>
        ) : (
          <>
            {!methods.length && (
              <p className="text-sm text-muted-foreground">Esta empresa não aceita pagamento online.</p>
            )}

            {!payment && methods.length > 0 && (
              <div className="space-y-4">
                <div>
                  <Label>Escolha o método</Label>
                  <RadioGroup value={selected} onValueChange={setSelected} className="grid grid-cols-2 gap-2 mt-2">
                    {methods.map((m) => {
                      const Icon = ICON[m];
                      return (
                        <label key={m} className={`flex items-center gap-2 p-3 border rounded-lg cursor-pointer ${selected === m ? "border-primary bg-primary/5" : ""}`}>
                          <RadioGroupItem value={m} className="sr-only" />
                          <Icon className="w-4 h-4" /> <span className="text-sm">{LABEL[m]}</span>
                        </label>
                      );
                    })}
                  </RadioGroup>
                </div>

                <div className="space-y-2">
                  <Label>CPF/CNPJ do pagador</Label>
                  <Input
                    value={payer.cpf_cnpj || ""}
                    onChange={(e) => setPayer({ ...payer, cpf_cnpj: e.target.value.replace(/\D/g, "") })}
                    placeholder="Apenas números"
                  />
                </div>

                <Button onClick={generate} disabled={loading} className="w-full">
                  {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Gerar pagamento
                </Button>
              </div>
            )}

            {payment && payment.method === "PIX" && payment.pix_qr_code && (
              <div className="space-y-3 text-center">
                <img
                  src={payment.pix_qr_code.startsWith('data:') ? payment.pix_qr_code : `data:image/png;base64,${payment.pix_qr_code}`}
                  alt="QR PIX"
                  className="mx-auto w-56 h-56 bg-white p-2 rounded-lg"
                />
                <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(payment.pix_payload || ""); toast({ title: "Copiado!" }); }}>
                  <Copy className="w-3 h-3 mr-1" /> Copiar código PIX
                </Button>
                <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" /> Aguardando confirmação...
                </p>
              </div>
            )}

            {payment && payment.method === "PIX" && !payment.pix_qr_code && payment.invoice_url && (
              <div className="space-y-3 text-center">
                <QrCode className="w-12 h-12 mx-auto text-primary" />
                <p className="text-sm">Você será redirecionado para gerar o QR PIX no checkout do gateway.</p>
                <Button asChild><a href={payment.invoice_url} target="_blank" rel="noreferrer">Abrir pagamento PIX</a></Button>
                <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" /> Aguardando confirmação...
                </p>
              </div>
            )}

            {payment && payment.method === "BOLETO" && (
              <div className="space-y-3 text-center">
                <Receipt className="w-12 h-12 mx-auto text-primary" />
                <p className="text-sm">Seu boleto foi gerado.</p>
                <Button asChild><a href={payment.bank_slip_url || payment.invoice_url} target="_blank" rel="noreferrer">Abrir boleto</a></Button>
                <p className="text-xs text-muted-foreground">Compensação em 1-3 dias úteis.</p>
              </div>
            )}

            {payment && (payment.method === "CREDIT_CARD" || payment.method === "DEBIT_CARD") && (
              <div className="space-y-3 text-center">
                <CreditCard className="w-12 h-12 mx-auto text-primary" />
                <Button asChild><a href={payment.invoice_url} target="_blank" rel="noreferrer">Pagar com cartão</a></Button>
                <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" /> Aguardando confirmação...
                </p>
              </div>
            )}
          </>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          {allowPayLater && !payment && !isPaid && (
            <Button variant="outline" onClick={onPayLater} className="w-full">Pagar no local</Button>
          )}
          {!isPaid && <Button variant="ghost" onClick={onClose}>Fechar</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
