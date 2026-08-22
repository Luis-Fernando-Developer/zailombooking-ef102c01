# Plano de Correção: Erro React #310 (Objects as Children)

O erro "React #310" ocorre quando um objeto é passado como filho no React em vez de um texto, número ou elemento. No contexto da personalização da Landing Page, isso geralmente acontece devido a dados corrompidos no JSON persistido no banco de dados, onde propriedades que deveriam ser strings (como `family` ou `color`) acabaram recebendo objetos aninhados.

## Ações Propostas

### 1. Robustez na Sanitização (LandingPageCustomizer.tsx)
Aumentar o rigor da função `sanitizeTheme` para detectar e corrigir proativamente qualquer aninhamento de objeto em campos que devem ser primitivos, garantindo que o estado do React nunca receba esses objetos.

### 2. Proteção nos Componentes de Configuração
Adicionar validações "strict" em cada componente de configuração (`BodySettings`, `HeaderSettings`, `HeroSettings`, etc.) para impedir que novas atualizações de estado injetem objetos em campos de texto ou números.

### 3. Fallbacks Seguros no ColorPicker e Typography
Garantir que os inputs nativos (como `<input type="color">`) recebam apenas strings válidas e que a função `getTypographyStyles` ignore qualquer valor que não seja um primitivo.

## Detalhes Técnicos

- **LandingPageCustomizer.tsx**: Refatorar `sanitizeTheme` para ser recursiva e deletar chaves que não correspondam aos tipos esperados.
- **utils.ts**: Fortalecer `getSafeValue` para garantir que `styles` CSS não recebam objetos.
- **ColorPicker.tsx**: Adicionar verificação de tipo antes de renderizar os inputs de cor.

---

### 📊 Relatório de Execução (Planejamento)

**Sub-agentes ativados:**
- 🎨 **UI Architect** — ✅ Planejado
- 🔍 **Code Auditor** — ✅ Planejado
- 🧪 **Testing Agent** — ✅ Planejado
- 🗄️ **Supabase Engineer** — ➖ Não necessário
