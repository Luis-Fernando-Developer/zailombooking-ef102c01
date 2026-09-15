import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { composeFullName, sanitizeNoSpaces, splitFullName, validateNoSpaces } from "@/lib/employeeName";

interface Employee {
  id: string;
  name: string;
  first_name?: string | null;
  second_name?: string | null;
  last_name?: string | null;
  nickname?: string | null;
  email: string;
  phone?: string | null;
}

interface Props {
  employee: Employee | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEmployeeUpdated: () => void;
}

export function SelfEditEmployeeDialog({ employee, open, onOpenChange, onEmployeeUpdated }: Props) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    first_name: "",
    second_name: "",
    last_name: "",
    nickname: "",
    email: "",
    phone: "",
  });

  useEffect(() => {
    if (!open || !employee) return;
    const fallback = splitFullName(employee.name || "");
    setFormData({
      first_name: employee.first_name ?? fallback.first_name,
      second_name: employee.second_name ?? fallback.second_name,
      last_name: employee.last_name ?? fallback.last_name,
      nickname: employee.nickname ?? "",
      email: employee.email ?? "",
      phone: employee.phone ?? "",
    });
  }, [open, employee]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employee) return;

    for (const [field, label] of [
      ["first_name", "Primeiro nome"],
      ["second_name", "Segundo nome"],
      ["last_name", "Sobrenome"],
    ] as const) {
      if (!validateNoSpaces((formData as any)[field])) {
        toast({
          title: `${label} inválido`,
          description: `${label} não pode conter espaços. Use apenas uma palavra.`,
          variant: "destructive",
        });
        return;
      }
    }

    const fullName = composeFullName(formData);
    if (!fullName) {
      toast({ title: "Nome obrigatório", description: "Informe ao menos o primeiro nome.", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.rpc("update_own_employee_profile", {
        p_employee_id: employee.id,
        p_first_name: formData.first_name || null,
        p_second_name: formData.second_name || null,
        p_last_name: formData.last_name || null,
        p_nickname: formData.nickname || null,
        p_email: formData.email,
        p_phone: formData.phone,
      });

      if (error) throw error;

      toast({
        title: "Perfil atualizado",
        description: "Seus dados foram atualizados com sucesso.",
      });
      onOpenChange(false);
      onEmployeeUpdated();
    } catch (error) {
      console.error("Error updating own employee profile:", error);
      toast({
        title: "Erro",
        description: "Não foi possível atualizar seus dados.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (!employee) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Editar Colaborador</DialogTitle>
          <DialogDescription>Edite seus dados pessoais</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="space-y-2">
              <Label htmlFor="self_first_name">Primeiro nome *</Label>
              <Input id="self_first_name" value={formData.first_name} onChange={(e) => setFormData(p => ({ ...p, first_name: sanitizeNoSpaces(e.target.value) }))} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="self_second_name">Segundo nome</Label>
              <Input id="self_second_name" value={formData.second_name} onChange={(e) => setFormData(p => ({ ...p, second_name: sanitizeNoSpaces(e.target.value) }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="self_last_name">Sobrenome</Label>
              <Input id="self_last_name" value={formData.last_name} onChange={(e) => setFormData(p => ({ ...p, last_name: sanitizeNoSpaces(e.target.value) }))} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground -mt-2">Cada campo aceita apenas uma palavra (sem espaços).</p>
          <div className="space-y-2">
            <Label htmlFor="self_nickname">Apelido</Label>
            <Input id="self_nickname" value={formData.nickname} onChange={(e) => setFormData(p => ({ ...p, nickname: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="self_email">Email *</Label>
            <Input id="self_email" type="email" value={formData.email} onChange={(e) => setFormData(p => ({ ...p, email: e.target.value }))} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="self_phone">Telefone</Label>
            <Input id="self_phone" value={formData.phone} onChange={(e) => setFormData(p => ({ ...p, phone: e.target.value }))} />
          </div>
          <div className="flex gap-4 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="flex-1">Cancelar</Button>
            <Button type="submit" disabled={loading} className="flex-1">{loading ? "Salvando..." : "Salvar Alterações"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
