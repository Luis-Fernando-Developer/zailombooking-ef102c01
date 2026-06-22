import { MessageSquare, Construction } from "lucide-react";

export default function Chat() {
  return (
    <div className="container max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold flex items-center gap-2 mb-6">
        <MessageSquare className="w-6 h-6" /> Bate-papo
      </h1>
      <div className="rounded-lg border border-dashed p-12 text-center space-y-3">
        <Construction className="w-12 h-12 mx-auto text-muted-foreground" />
        <h2 className="text-lg font-semibold">Em breve</h2>
        <p className="text-sm text-muted-foreground">
          O módulo de bate-papo interno entre colaboradores está em desenvolvimento.
        </p>
      </div>
    </div>
  );
}
