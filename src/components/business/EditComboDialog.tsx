import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Edit } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";

interface Service {
  id: string;
  name: string;
  price: number;
  duration_minutes: number;
}

interface Combo {
  id: string;
  name: string;
  description?: string;
  combo_price: number;
  original_total_price?: number;
  total_duration_minutes?: number;
  is_active?: boolean;
  items?: { service_id: string; service?: { id?: string; name?: string } }[];
}

interface EditComboDialogProps {
  combo: Combo;
  services: Service[];
  onComboUpdated: () => void;
}

export function EditComboDialog({ combo, services, onComboUpdated }: EditComboDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    combo_price: 0,
    is_active: true,
  });
  const [selectedServices, setSelectedServices] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      setFormData({
        name: combo.name,
        description: combo.description || "",
        combo_price: combo.combo_price,
        is_active: combo.is_active ?? true,
      });
      setSelectedServices(combo.items?.map((it) => it.service_id) || []);
    }
  }, [open, combo]);

  const toggleService = (serviceId: string) => {
    setSelectedServices((prev) =>
      prev.includes(serviceId)
        ? prev.filter((id) => id !== serviceId)
        : [...prev, serviceId]
    );
  };

  const calculateTotals = () => {
    const selected = services.filter((s) => selectedServices.includes(s.id));
    const totalPrice = selected.reduce((sum, s) => sum + s.price, 0);
    const totalDuration = selected.reduce((sum, s) => sum + s.duration_minutes, 0);
    return { totalPrice, totalDuration };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (selectedServices.length < 2) {
      toast({
        title: "Erro",
        description: "Selecione pelo menos 2 serviços para o combo",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const { totalPrice, totalDuration } = calculateTotals();

      // Update combo
      const { error: comboError } = await supabase
        .from("service_combos")
        .update({
          name: formData.name,
          description: formData.description || null,
          combo_price: formData.combo_price,
          original_total_price: totalPrice,
          total_duration_minutes: totalDuration,
          is_active: formData.is_active,
        })
        .eq("id", combo.id);

      if (comboError) throw comboError;

      // Delete old items
      const { error: deleteError } = await supabase
        .from("service_combo_items")
        .delete()
        .eq("combo_id", combo.id);

      if (deleteError) throw deleteError;

      // Insert new items
      const comboItems = selectedServices.map((serviceId) => ({
        combo_id: combo.id,
        service_id: serviceId,
      }));

      const { error: itemsError } = await supabase
        .from("service_combo_items")
        .insert(comboItems);

      if (itemsError) throw itemsError;

      toast({
        title: "Sucesso",
        description: "Combo atualizado com sucesso!",
      });

      setOpen(false);
      onComboUpdated();
    } catch (error) {
      console.error("Error updating combo:", error);
      toast({
        title: "Erro",
        description: "Erro ao atualizar combo",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const { totalPrice, totalDuration } = calculateTotals();

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(price);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Edit className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Combo</DialogTitle>
          <DialogDescription>Atualize as informações do combo de serviços.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-combo-name">Nome do Combo *</Label>
              <Input
                id="edit-combo-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-combo-description">Descrição</Label>
              <Textarea
                id="edit-combo-description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={2}
              />
            </div>

            <div className="grid gap-2">
              <Label>Serviços do Combo *</Label>
              <div className="border rounded-md p-3 max-h-40 overflow-y-auto space-y-2">
                {services.map((service) => (
                  <div key={service.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`edit-service-${service.id}`}
                      checked={selectedServices.includes(service.id)}
                      onCheckedChange={() => toggleService(service.id)}
                    />
                    <label
                      htmlFor={`edit-service-${service.id}`}
                      className="text-sm flex-1 cursor-pointer"
                    >
                      {service.name} - {formatPrice(service.price)}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            {selectedServices.length >= 2 && (
              <div className="bg-muted p-3 rounded-md space-y-1 text-sm">
                <div>Preço original: {formatPrice(totalPrice)}</div>
                <div>Duração total: {totalDuration} min</div>
              </div>
            )}

            <div className="grid gap-2">
              <Label htmlFor="edit-combo-price">Preço do Combo (R$) *</Label>
              <Input
                id="edit-combo-price"
                type="number"
                min="0"
                step="0.01"
                value={formData.combo_price}
                onChange={(e) =>
                  setFormData({ ...formData, combo_price: parseFloat(e.target.value) || 0 })
                }
                required
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="edit-combo-active">Combo Ativo</Label>
              <Switch
                id="edit-combo-active"
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading || selectedServices.length < 2}>
              {loading ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
