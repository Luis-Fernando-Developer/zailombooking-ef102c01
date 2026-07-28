import { useEffect, useState } from "react";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { SuperAdminSidebar } from "@/components/admin/SuperAdminSidebar";
import { BookingLogo } from "@/components/BookingLogo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Layers, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";

interface EvoInstance {
  name: string | null;
  status: string;
  number: string | null;
  updated_at: string | null;
  profileName: string | null;
  profilePicUrl: string | null;
  owner: { company_id: string; company_name: string | null } | null;
}

function statusColor(s: string) {
  const v = (s ?? "").toLowerCase();
  if (["open", "connected", "connect"].includes(v)) return "bg-green-500";
  if (["connecting", "qr", "syncing"].includes(v)) return "bg-yellow-500";
  return "bg-gray-500";
}

function statusLabel(s: string) {
  const v = (s ?? "").toLowerCase();
  if (["open", "connected", "connect"].includes(v)) return "Conectado";
  if (["connecting", "qr", "syncing"].includes(v)) return "Conectando";
  if (["close", "closed", "disconnected"].includes(v)) return "Desconectado";
  return s || "-";
}

export default function SuperAdminInstances() {
  const { toast } = useToast();
  const [items, setItems] = useState<EvoInstance[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("super-admin-list-instances");
    if (error) {
      toast({ title: "Erro ao carregar", description: error.message, variant: "destructive" });
      setItems([]);
    } else {
      setItems((data as any)?.instances ?? []);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-gradient-hero">
        <SuperAdminSidebar />
        <SidebarInset className="flex-1 bg-transparent">
          <header className="border-b border-primary/20 bg-card/30 backdrop-blur-sm sticky top-0 z-10">
            <div className="flex items-center justify-between px-4 h-16">
              <div className="flex items-center gap-4">
                <SidebarTrigger />
                <div className="flex items-center gap-2 lg:hidden">
                  <BookingLogo showText={false} className="h-8 w-8" />
                  <span className="font-bold text-gradient">Super Admin</span>
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={load} disabled={loading}>
                <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                Atualizar
              </Button>
            </div>
          </header>

          <main className="p-4 lg:p-8">
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-gradient mb-2">Instancias</h1>
              <p className="text-muted-foreground">Todas as instancias globais do Evolution ({items.length}).</p>
            </div>

            <Card className="card-glow bg-card/50 backdrop-blur-sm border-primary/20">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <Layers className="h-5 w-5 text-primary" />
                  <CardTitle>Lista de Instancias</CardTitle>
                </div>
                <CardDescription>Fonte: Evolution Manager (global).</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <p className="text-center text-muted-foreground py-8">Carregando...</p>
                ) : items.length === 0 ? (
                  <div className="text-center py-12 border-2 border-dashed border-primary/20 rounded-lg">
                    <p className="text-muted-foreground">Nenhuma instancia encontrada.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-muted-foreground border-b border-primary/20">
                        <tr>
                          <th className="text-left py-2 px-2">Instancia</th>
                          <th className="text-left py-2 px-2">Empresa</th>
                          <th className="text-left py-2 px-2">Numero</th>
                          <th className="text-left py-2 px-2">Status</th>
                          <th className="text-left py-2 px-2">Ultima atualizacao</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((i) => (
                          <tr key={i.name ?? Math.random()} className="border-b border-primary/5">
                            <td className="py-2 px-2">
                              <div className="flex items-center gap-2">
                                {i.profilePicUrl && (
                                  <img src={i.profilePicUrl} alt="" className="w-6 h-6 rounded-full" />
                                )}
                                <div>
                                  <p className="font-medium">{i.name ?? "-"}</p>
                                  {i.profileName && (
                                    <p className="text-xs text-muted-foreground">{i.profileName}</p>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="py-2 px-2">
                              {i.owner ? (
                                <span>{i.owner.company_name ?? i.owner.company_id}</span>
                              ) : (
                                <Badge variant="outline">Orfa</Badge>
                              )}
                            </td>
                            <td className="py-2 px-2 font-mono text-xs">{i.number ?? "-"}</td>
                            <td className="py-2 px-2">
                              <Badge variant="outline">
                                <span className={`w-2 h-2 rounded-full mr-2 ${statusColor(i.status)}`} />
                                {statusLabel(i.status)}
                              </Badge>
                            </td>
                            <td className="py-2 px-2 text-xs text-muted-foreground">
                              {i.updated_at ? new Date(i.updated_at).toLocaleString("pt-BR") : "-"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
