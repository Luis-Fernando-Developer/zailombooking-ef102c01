import { CalendarClock } from "lucide-react";
import { AutomacaoPlaceholder } from "./_Placeholder";

export default function AutomacoesGatilhos() {
  return (
    <AutomacaoPlaceholder
      title="Gatilhos e Agendamentos"
      description="Configure gatilhos automáticos por evento (pré-agendamento, aniversário, retorno etc.)."
      icon={CalendarClock}
    />
  );
}
