import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { CreditCard, Loader2, Plus, Trash2, Star } from "lucide-react";

type SavedCard = {
  id: string;
  provider: string;
  card_brand: string | null;
  card_last4: string;
  expiry_month: number | null;
  expiry_year: number | null;
  is_default: boolean;
};

type Props = {
  companyId: string;
  mode?: "manage" | "select";
  selectedCardId?: string | null;
  onSelectCard?: (id: string | null) => void;
  onCardsChanged?: (cards: SavedCard[]) => void;
};

const emptyForm = {
  holderName: "", number: "", expiryMonth: "", expiryYear: "", ccv: "",
  name: "", email: "", cpfCnpj: "", postalCode: "", addressNumber: "", phone: "",
};

export function SavedCardsWallet({ companyId, mode = "manage", selectedCardId = null, onSelectCard, onCardsChanged }: Props) {
  const { toast } = useToast();
  const [cards, setCards] = useState<SavedCard[]>([]);
  const [provider, setProvider] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const loadCards = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("client-payment-methods", {
        body: { action: "list-cards", company_id: companyId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const list = Array.isArray(data?.cards) ? data.cards as SavedCard[] : [];
      setCards(list);
      setProvider(data?.provider || null);
      onCardsChanged?.(list);
      if (selectedCardId && !list.some((card) => card.id === selectedCardId)) onSelectCard?.(null);
      if (!selectedCardId && mode === "select") {
        const defaultCard = list.find((card) => card.is_default);
        if (defaultCard) onSelectCard?.(defaultCard.id);
      }
    } catch (error: any) {
      console.error("[SavedCardsWallet] load failed", error?.message || error);
      setCards([]);
      setProvider(null);
    } finally {
      setLoading(false);
    }
  }, [companyId, mode, onCardsChanged, onSelectCard, selectedCardId]);

  useEffect(() => { void loadCards(); }, [loadCards]);

  const callAction = async (action: string, extra: Record<string, unknown> = {}) => {
    const { data, error } = await supabase.functions.invoke("client-payment-methods", {
      body: { action, company_id: companyId, ...extra },
    });
    if (error) {
      const context = (error as any)?.context;
      if (context && typeof context.json === "function") {
        try { const payload = await context.json(); if (payload?.error) throw new Error(String(payload.error)); } catch (e) { if (e instanceof Error && e.message !== error.message) throw e; }
      }
      throw new Error(error.message || "Não foi possível concluir a operação.");
    }
    if (data?.error) throw new Error(data.error);
    return data;
  };

  const saveCard = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const cardNumber = form.number.replace(/\D/g, "");
      const cpfCnpj = form.cpfCnpj.replace(/\D/g, "");
      const postalCode = form.postalCode.replace(/\D/g, "");
      const phone = form.phone.replace(/\D/g, "");
      if (cardNumber.length < 13 || cardNumber.length > 19) throw new Error("Confira o número do cartão.");
      if (!/^\d{1,2}$/.test(form.expiryMonth) || Number(form.expiryMonth) < 1 || Number(form.expiryMonth) > 12) throw new Error("Confira o mês de validade.");
      if (!/^\d{4}$/.test(form.expiryYear) || Number(form.expiryYear) < new Date().getFullYear()) throw new Error("Confira o ano de validade com quatro dígitos.");
      if (!/^\d{3,4}$/.test(form.ccv)) throw new Error("Confira o código de segurança.");
      if (!form.holderName.trim() || !form.name.trim() || !form.email.trim() || cpfCnpj.length < 11 || postalCode.length !== 8 || !form.addressNumber.trim()) {
        throw new Error("Preencha os dados do titular, CPF/CNPJ, CEP e número do endereço.");
      }
      const saveResult = await callAction("save-card", {
        method_data: {
          creditCard: {
            holderName: form.holderName.trim(),
            number: cardNumber,
            expiryMonth: form.expiryMonth.padStart(2, "0"),
            expiryYear: form.expiryYear,
            ccv: form.ccv,
          },
          creditCardHolderInfo: {
            name: form.name.trim(),
            email: form.email.trim(),
            cpfCnpj,
            postalCode,
            addressNumber: form.addressNumber.trim(),
            phone: phone || undefined,
            mobilePhone: phone || undefined,
          },
        },
      });
      setForm(emptyForm);
      setDialogOpen(false);
      if (saveResult?.card?.id) onSelectCard?.(saveResult.card.id);
      toast({ title: "Cartão salvo", description: "O cartão foi tokenizado pelo gateway e adicionado à sua carteira." });
      await loadCards();
    } catch (error: any) {
      toast({ title: "Não foi possível salvar o cartão", description: error?.message || "Tente novamente.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const setDefault = async (id: string) => {
    try {
      await callAction("set-default", { card_id: id });
      await loadCards();
      toast({ title: "Cartão padrão atualizado" });
    } catch (error: any) {
      toast({ title: "Erro", description: error?.message || "Não foi possível alterar o cartão padrão.", variant: "destructive" });
    }
  };

  const removeCard = async (id: string) => {
    try {
      await callAction("delete-card", { card_id: id });
      if (selectedCardId === id) onSelectCard?.(null);
      await loadCards();
      toast({ title: "Cartão removido da carteira" });
    } catch (error: any) {
      toast({ title: "Erro", description: error?.message || "Não foi possível remover o cartão.", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {mode === "manage"
            ? "A carteira guarda somente a referência segura do gateway e os dados mascarados do cartão."
            : "Selecione um cartão salvo ou adicione um novo cartão para este gateway."}
        </p>
        {provider === "asaas" && (
          <Button type="button" size="sm" variant={mode === "manage" ? "default" : "outline"} onClick={() => setDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Adicionar cartão
          </Button>
        )}
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-6 text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando cartões…</div>
      ) : cards.length ? (
        <RadioGroup
          value={selectedCardId || ""}
          onValueChange={(id) => onSelectCard?.(id || null)}
          className="space-y-2"
        >
          {cards.map((card) => (
            <div key={card.id} className="flex items-center gap-3 rounded-xl border p-3">
              {mode === "select" && <RadioGroupItem value={card.id} id={`saved-card-${card.id}`} />}
              <CreditCard className="h-5 w-5 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  <span>{card.card_brand || "Cartão"} •••• {card.card_last4}</span>
                  {card.is_default && <Badge variant="secondary">Padrão</Badge>}
                </div>
                <p className="text-xs text-muted-foreground">
                  {card.expiry_month && card.expiry_year ? `Validade ${String(card.expiry_month).padStart(2, "0")}/${card.expiry_year}` : "Validade não informada"}
                </p>
              </div>
              {mode === "manage" && (
                <div className="flex items-center gap-1">
                  {!card.is_default && <Button type="button" variant="ghost" size="icon" title="Definir como padrão" onClick={() => void setDefault(card.id)}><Star className="h-4 w-4" /></Button>}
                  <Button type="button" variant="ghost" size="icon" title="Remover cartão" onClick={() => void removeCard(card.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              )}
            </div>
          ))}
        </RadioGroup>
      ) : (
        <div className="rounded-xl border border-dashed p-6 text-center">
          <CreditCard className="mx-auto mb-3 h-8 w-8 text-muted-foreground opacity-40" />
          <p className="text-sm text-muted-foreground">Nenhum cartão salvo nesta conta de recebimento.</p>
          {mode === "manage" && provider === "asaas" && <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => setDialogOpen(true)}>Adicionar primeiro cartão</Button>}
        </div>
      )}
      {provider && provider !== "asaas" && (
        <p className="text-xs text-muted-foreground">O cadastro de novos cartões ainda não está habilitado para este gateway. O checkout normal continua disponível.</p>
      )}

      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setForm(emptyForm); }}>
        <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Adicionar cartão</DialogTitle>
            <DialogDescription>O cartão será enviado ao Asaas para tokenização. O Zailom não grava o número completo nem o código de segurança.</DialogDescription>
          </DialogHeader>
          <form onSubmit={saveCard} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="saved-card-holder">Nome impresso no cartão</Label>
              <Input id="saved-card-holder" autoComplete="cc-name" value={form.holderName} onChange={(e) => setForm({ ...form, holderName: e.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="saved-card-number">Número do cartão</Label>
              <Input id="saved-card-number" type="text" autoComplete="cc-number" inputMode="numeric" value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value.replace(/[^\d ]/g, "").slice(0, 23) })} placeholder="0000 0000 0000 0000" required />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2"><Label htmlFor="saved-card-month">Mês</Label><Input id="saved-card-month" type="text" inputMode="numeric" autoComplete="cc-exp-month" value={form.expiryMonth} onChange={(e) => setForm({ ...form, expiryMonth: e.target.value.replace(/\D/g, "").slice(0, 2) })} placeholder="MM" required /></div>
              <div className="space-y-2"><Label htmlFor="saved-card-year">Ano</Label><Input id="saved-card-year" type="text" inputMode="numeric" autoComplete="cc-exp-year" value={form.expiryYear} onChange={(e) => setForm({ ...form, expiryYear: e.target.value.replace(/\D/g, "").slice(0, 4) })} placeholder="AAAA" required /></div>
              <div className="space-y-2"><Label htmlFor="saved-card-ccv">CVV</Label><Input id="saved-card-ccv" type="password" autoComplete="cc-csc" inputMode="numeric" value={form.ccv} onChange={(e) => setForm({ ...form, ccv: e.target.value.replace(/\D/g, "").slice(0, 4) })} placeholder="•••" required /></div>
            </div>
            <SeparatorLine />
            <p className="text-sm font-medium">Dados do titular</p>
            <div className="space-y-2"><Label htmlFor="saved-card-name">Nome completo</Label><Input id="saved-card-name" autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
            <div className="space-y-2"><Label htmlFor="saved-card-email">E-mail</Label><Input id="saved-card-email" type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label htmlFor="saved-card-cpf">CPF/CNPJ</Label><Input id="saved-card-cpf" inputMode="numeric" value={form.cpfCnpj} onChange={(e) => setForm({ ...form, cpfCnpj: e.target.value.replace(/\D/g, "").slice(0, 14) })} required /></div>
              <div className="space-y-2"><Label htmlFor="saved-card-phone">Telefone</Label><Input id="saved-card-phone" inputMode="tel" autoComplete="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, "").slice(0, 13) })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label htmlFor="saved-card-postal">CEP</Label><Input id="saved-card-postal" inputMode="numeric" autoComplete="postal-code" value={form.postalCode} onChange={(e) => setForm({ ...form, postalCode: e.target.value.replace(/\D/g, "").slice(0, 8) })} required /></div>
              <div className="space-y-2"><Label htmlFor="saved-card-address-number">Número do endereço</Label><Input id="saved-card-address-number" value={form.addressNumber} onChange={(e) => setForm({ ...form, addressNumber: e.target.value })} required /></div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancelar</Button>
              <Button type="submit" disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Tokenizar e salvar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SeparatorLine() {
  return <div className="border-t pt-1" />;
}
