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
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { Gift, Plus, Trash2, Edit, Star } from "lucide-react";

interface Service {
  id: string;
  name: string;
  price: number;
}

// Aligned with database schema - client_rewards table
interface Reward {
  id: string;
  name: string;
  description: string | null;
  reward_service_id: string | null;
  required_procedures: number;
  count_specific_service: boolean;
  specific_service_id: string | null;
  is_active: boolean;
  reward_service?: Service;
  specific_service?: Service;
}

interface RewardsConfigProps {
  companyId: string;
}

export function RewardsConfig({ companyId }: RewardsConfigProps) {
  const { toast } = useToast();
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingReward, setEditingReward] = useState<Reward | null>(null);
  
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    reward_service_id: "",
    required_procedures: 10,
    count_specific_service: false,
    specific_service_id: "",
    is_active: true
  });

  useEffect(() => {
    fetchData();
  }, [companyId]);

  const fetchData = async () => {
    try {
      // Fetch services
      const { data: servicesData } = await supabase
        .from('services')
        .select('id, name, price')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .order('name');

      if (servicesData) setServices(servicesData);

      // Fetch rewards
      const { data: rewardsData } = await supabase
        .from('client_rewards')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });

      if (rewardsData) {
        // Enrich with service names
        const enrichedRewards = rewardsData.map(reward => ({
          id: reward.id,
          name: reward.name,
          description: reward.description,
          reward_service_id: reward.reward_service_id,
          required_procedures: reward.required_procedures,
          count_specific_service: reward.count_specific_service ?? false,
          specific_service_id: reward.specific_service_id,
          is_active: reward.is_active ?? true,
          reward_service: servicesData?.find(s => s.id === reward.reward_service_id),
          specific_service: servicesData?.find(s => s.id === reward.specific_service_id)
        }));
        setRewards(enrichedRewards);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (reward?: Reward) => {
    if (reward) {
      setEditingReward(reward);
      setFormData({
        name: reward.name,
        description: reward.description || "",
        reward_service_id: reward.reward_service_id || "",
        required_procedures: reward.required_procedures,
        count_specific_service: reward.count_specific_service,
        specific_service_id: reward.specific_service_id || "",
        is_active: reward.is_active
      });
    } else {
      setEditingReward(null);
      setFormData({
        name: "",
        description: "",
        reward_service_id: "",
        required_procedures: 10,
        count_specific_service: false,
        specific_service_id: "",
        is_active: true
      });
    }
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      toast({
        title: "Erro",
        description: "O nome do brinde é obrigatório.",
        variant: "destructive"
      });
      return;
    }

    try {
      const rewardData = {
        company_id: companyId,
        name: formData.name,
        description: formData.description || null,
        reward_service_id: formData.reward_service_id || null,
        required_procedures: formData.required_procedures,
        count_specific_service: formData.count_specific_service,
        specific_service_id: formData.count_specific_service ? formData.specific_service_id || null : null,
        is_active: formData.is_active
      };

      if (editingReward) {
        const { error } = await supabase
          .from('client_rewards')
          .update(rewardData)
          .eq('id', editingReward.id);
        
        if (error) throw error;
        toast({ title: "Brinde atualizado com sucesso!" });
      } else {
        const { error } = await supabase
          .from('client_rewards')
          .insert([rewardData]);
        
        if (error) throw error;
        toast({ title: "Brinde criado com sucesso!" });
      }

      setDialogOpen(false);
      fetchData();
    } catch (error) {
      console.error('Error saving reward:', error);
      toast({
        title: "Erro",
        description: "Erro ao salvar brinde.",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (rewardId: string) => {
    if (!confirm("Tem certeza que deseja excluir este brinde?")) return;
    
    try {
      const { error } = await supabase
        .from('client_rewards')
        .delete()
        .eq('id', rewardId);
      
      if (error) throw error;
      toast({ title: "Brinde excluído com sucesso!" });
      fetchData();
    } catch (error) {
      console.error('Error deleting reward:', error);
      toast({
        title: "Erro",
        description: "Erro ao excluir brinde.",
        variant: "destructive",
      });
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(price);
  };

  if (loading) {
    return (
      <div className="flex justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Gift className="w-6 h-6 text-primary" />
            Programa de Brindes
          </h2>
          <p className="text-muted-foreground">
            Configure brindes para fidelizar seus clientes
          </p>
        </div>
        <Button variant="default" onClick={() => handleOpenDialog()}>
          <Plus className="w-4 h-4 mr-2" />
          Novo Brinde
        </Button>
      </div>

      {rewards.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Gift className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Nenhum brinde configurado</h3>
            <p className="text-muted-foreground text-center mb-4">
              Crie brindes para premiar seus clientes fiéis após realizarem determinados procedimentos.
            </p>
            <Button variant="outline" onClick={() => handleOpenDialog()}>
              <Plus className="w-4 h-4 mr-2" />
              Criar Primeiro Brinde
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {rewards.map((reward) => (
            <Card key={reward.id} className={`${!reward.is_active ? 'opacity-60' : ''}`}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
                      <Star className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        {reward.name}
                        {!reward.is_active && <Badge variant="secondary">Inativo</Badge>}
                      </CardTitle>
                      <CardDescription>
                        {reward.reward_service ? `Serviço: ${reward.reward_service.name} (${formatPrice(reward.reward_service.price)})` : 'Sem serviço vinculado'}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => handleOpenDialog(reward)}>
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(reward.id)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Procedimentos necessários</p>
                    <p className="font-medium">{reward.required_procedures} procedimentos</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Conta apenas</p>
                    <p className="font-medium">
                      {reward.count_specific_service
                        ? reward.specific_service?.name || "Serviço específico"
                        : "Todos os serviços"
                      }
                    </p>
                  </div>
                  {reward.description && (
                    <div className="md:col-span-2">
                      <p className="text-muted-foreground">Descrição</p>
                      <p className="font-medium">{reward.description}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Reward Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg bg-card">
          <DialogHeader>
            <DialogTitle>{editingReward ? "Editar Brinde" : "Novo Brinde"}</DialogTitle>
            <DialogDescription>
              Configure as regras do programa de brindes
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Nome do Brinde *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Ex: Corte grátis após 10 procedimentos"
              />
            </div>

            <div className="space-y-2">
              <Label>Descrição (opcional)</Label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Descrição do brinde..."
              />
            </div>

            <div className="space-y-2">
              <Label>Serviço como Brinde</Label>
              <Select
                value={formData.reward_service_id}
                onValueChange={(value) => setFormData({ ...formData, reward_service_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o serviço gratuito" />
                </SelectTrigger>
                <SelectContent className="bg-card">
                  {services.map((service) => (
                    <SelectItem key={service.id} value={service.id}>
                      {service.name} ({formatPrice(service.price)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Quantidade de Procedimentos</Label>
              <Input
                type="number"
                min="1"
                value={formData.required_procedures}
                onChange={(e) => setFormData({ ...formData, required_procedures: parseInt(e.target.value) || 1 })}
              />
              <p className="text-xs text-muted-foreground">
                Cliente ganha o brinde após {formData.required_procedures} procedimentos
              </p>
            </div>

            <div className="flex items-center justify-between p-3 bg-primary/5 rounded-lg">
              <div>
                <p className="font-medium">Contar serviço específico</p>
                <p className="text-sm text-muted-foreground">
                  Se ativado, conta apenas um serviço específico
                </p>
              </div>
              <Switch
                checked={formData.count_specific_service}
                onCheckedChange={(checked) => setFormData({ ...formData, count_specific_service: checked })}
              />
            </div>

            {formData.count_specific_service && (
              <div className="space-y-2">
                <Label>Serviço a Contar</Label>
                <Select
                  value={formData.specific_service_id}
                  onValueChange={(value) => setFormData({ ...formData, specific_service_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o serviço" />
                  </SelectTrigger>
                  <SelectContent className="bg-card">
                    {services.map((service) => (
                      <SelectItem key={service.id} value={service.id}>
                        {service.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex items-center justify-between pt-4 border-t border-primary/10">
              <Label>Brinde Ativo</Label>
              <Switch
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit">
                {editingReward ? "Salvar" : "Criar Brinde"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
