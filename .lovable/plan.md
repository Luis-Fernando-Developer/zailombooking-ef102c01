
# Plano de Implementação - Correção do Erro Crítico nas Configurações

O erro "Minified React error #310" ocorre quando o React tenta renderizar um objeto onde deveria haver um elemento React (string, número ou componente). No contexto da refatoração recente da Personalização da Landing Page V2, isso geralmente acontece se um objeto de configuração (como um gradiente ou tipografia) for passado diretamente para o DOM ou renderizado como texto.

## Ações Imediatas

1. **Auditoria de Renderização no `LandingPageCustomizer` e Sub-componentes**:
   - Verificar se algum campo do objeto `customization` está sendo renderizado diretamente.
   - Corrigir o `StatCard` no `Dashboard.tsx` (se aplicável, embora o erro tenha sido relatado em "Configurações").
   - Revisar o `ColorPicker` para garantir que `gradientSettings.colors` (que é um array) não está sendo renderizado de forma inválida.

2. **Proteção de Tipos e Fallbacks**:
   - Garantir que todos os componentes de personalização (`HeaderSettings`, `BodySettings`, etc.) tratem corretamente objetos aninhados.
   - Adicionar verificações de segurança para evitar que `[object Object]` apareça na UI.

3. **Verificação do `Settings.tsx`**:
   - O arquivo `src/pages/business/Settings.tsx` renderiza o `LandingPageCustomizer`.
   - Verificar a passagem de props para o `LandingPageCustomizer`.

## Detalhes Técnicos

- **Causa Provável**: Um objeto como `{ type: "linear", ... }` sendo colocado dentro de um `<span>` ou similar.
- **Localização provável**: `src/components/business/personalization/TypographySettings.tsx` ou `src/components/business/ColorPicker.tsx`.

## Próximos Passos

- Identificar o ponto exato da falha usando logs de debug no sandbox.
- Corrigir a renderização para usar apenas propriedades primitivas.
