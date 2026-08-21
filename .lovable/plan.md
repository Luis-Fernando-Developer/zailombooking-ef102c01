# Plano de Implementação: Refatoração da Personalização da Landing Page (V2)

Refatorar o sistema de personalização da Landing Page para permitir configurações granulares de tipografia e cores por elemento, utilizando uma arquitetura modular e escalável.

## Alterações Técnicas

### 1. Estrutura de Dados e Tipos
- Centralização de tipos em `src/components/business/personalization/types.ts`.
- Definição da interface `TypographyConfig` abrangendo: família, peso (300-900), tamanho, cor (sólida/gradiente), alinhamento, line-height e letter-spacing.
- Criação de constantes para opções de fontes e pesos.

### 2. Componentes de UI (Modulares)
- **TypographySettings**: Controle unificado para todos os campos de texto.
- **ColorPicker**: (Existente) Reutilizado para cores e gradientes.
- **Configurações por Seção**: Criados `BodySettings`, `HeaderSettings`, `HeroSettings`, `CardSettings`, `ButtonSettings` e `FooterSettings` para agrupar logicamente os controles.

### 3. Integração no Customizador
- Substituição da aba "Font" por "Body" (Fallback).
- Atualização das abas existentes (Header, Hero, Botões, Cards, Footer) para incluir os novos controles granulares.
- Utilização de `Accordion` e `Collapsible` para manter a interface organizada.

### 4. Banco de Dados (Supabase Externo)
- **Nota**: As alterações de banco serão fornecidas como script SQL para execução manual.
- Adição de colunas JSONB na tabela `company_customizations` para armazenar as novas configurações sem quebrar a compatibilidade com campos antigos.

### 5. Renderização (Frontend)
- Implementação da lógica de fallback: verifica se o elemento tem estilo próprio -> verifica seção -> verifica body -> valor default.
- Aplicação dinâmica de estilos via inline `style` ou classes CSS variáveis para garantir o preview em tempo real.

## Etapas de Execução

1. **Finalizar Componentes de Configuração**: Concluir a criação dos componentes modulares iniciados.
2. **Atualizar `LandingPageCustomizer.tsx`**: Integrar todos os novos componentes e gerenciar o estado global de customização.
3. **Gerar Script SQL**: Preparar o script de migração para o banco de dados externo.
4. **Atualizar Renderização Pública**: Ajustar os componentes da Landing Page (`Hero`, `Header`, etc.) para consumirem os novos dados granulares.
