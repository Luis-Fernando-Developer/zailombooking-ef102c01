import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExternalLink, Send } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

export function DisparosConfig({ companyId }: { companyId: string }) {
  const navigate = useNavigate();
  const { slug } = useParams();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Send className="w-5 h-5" /> Marketing e Disparos
        </CardTitle>
        <CardDescription>
          Gerencie suas campanhas de marketing e disparos em massa.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border bg-muted/30 p-6 text-center">
          <p className="text-sm text-muted-foreground mb-4">
            A ferramenta de disparos em massa agora possui uma área dedicada para melhor organização.
          </p>
          <Button onClick={() => navigate(`/${slug}/admin/automacoes/disparos`)}>
            Abrir Ferramenta de Disparos <ExternalLink className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
