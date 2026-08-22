# Plano de Correção: Erro Minified React #310 (Objects as Children)

O erro "Minified React error #310" ocorre quando o React tenta renderizar um objeto onde espera uma string, número ou elemento React. No contexto da personalização da Landing Page, isso geralmente acontece devido ao aninhamento acidental de objetos nas configurações de tipografia ou cores.

## Ações Propostas

### 1. Robustez no `TypographySettings`
Garantir que os valores passados para o componente de edição nunca sejam objetos aninhados (exceto o campo `gradient`).
- Adicionar validação no `updateConfig` para filtrar qualquer valor que seja um objeto inesperado.
- Normalizar o estado local antes de passar para os inputs.

### 2. Sanitização no `LandingPageCustomizer`
Sanitizar os dados carregados do Supabase antes de injetá-los no estado da aplicação.
- Implementar uma função `sanitizeTheme` que percorre recursivamente o objeto de tema e garante que campos de texto/número não contenham objetos aninhados.
- Tratar especificamente o campo `menu_typography` no `header`, que foi identificado como um ponto crítico de falha.

### 3. Proteção no `getTypographyStyles` e `getBackgroundStyles`
Adicionar verificações de tipo mais rigorosas nas funções utilitárias que geram estilos CSS.
- Se um valor de cor ou família de fonte for detectado como um objeto, aplicar um fallback de string seguro em vez de deixar o erro propagar.

### 4. Correção no `ColorPicker`
Garantir que os inputs nativos de cor (`type="color"`) recebam apenas strings hexadecimais válidas.
- Adicionar conversão explícita de HSL/RGB para HEX se necessário para o input nativo, ou simplesmente ignorar valores inválidos para o preview visual sem quebrar a renderização.

## Detalhes Técnicos

- **Arquivos afetados:**
    - `src/components/business/personalization/utils.ts`
    - `src/components/business/personalization/TypographySettings.tsx`
    - `src/components/business/LandingPageCustomizer.tsx`
    - `src/components/business/ColorPicker.tsx`

- **Estratégia de Depuração:**
    - Manter logs temporários que imprimam o caminho do objeto corrompido para que, caso o erro persista, saibamos exatamente qual campo no banco de dados está "sujo".
