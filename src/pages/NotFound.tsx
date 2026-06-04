import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground p-4">
      <h1 className="text-9xl font-bold text-primary mb-4">404</h1>
      <h2 className="text-2xl font-semibold mb-6">Página não encontrada</h2>
      <p className="text-muted-foreground mb-8 text-center max-w-md">
        Desculpe, a página que você está procurando não existe ou foi movida.
      </p>
      <Button asChild variant="neon">
        <Link to="/">Voltar para o Início</Link>
      </Button>
    </div>
  );
}
