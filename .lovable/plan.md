# Plano de Refatoração: Personalização Granular da Landing Page (Multi-Tenant)

O objetivo é permitir que cada empresa controle visualmente suas seções da Landing Page de forma independente, desacoplando as configurações globais de "Botões" e "Cards" e integrando-as em cada seção (Serviços, Profissionais, Sobre, etc.). Também corrigiremos falhas na renderização do Hero e do Header.

## 1. Mudança na Estrutura de Dados (Supabase)
Migração para adicionar suporte às novas seções e configurações granulares no JSONB `theme` da tabela `company_customizations`.

## 2. Refatoração do Customizer (Admin)
- **LandingPageCustomizer.tsx**: Atualizar a estrutura de abas para: Body, Header, Hero, Serviços, Profissionais, Sobre, Rodapé, Extra.
- **HeroSettings.tsx**: Corrigir a injeção de `title_typography.text` e `description_typography.text` para que reflitam na preview e no banco.
- **HeaderSettings.tsx**: Adicionar configuração individual para botões do header.
- **Novos Componentes de Configuração**:
  - `ServicesSettings.tsx`: Controle de aparência da seção, botões de serviço e cards de serviço.
  - `ProfessionalsSettings.tsx`: Controle de aparência e cards de profissionais.
  - `AboutSettings.tsx`: Controle de aparência da seção "Sobre".
- **Refatoração de Botões e Cards**: Transformar `ButtonSettings` e `CardSettings` em componentes reutilizáveis que podem ser instanciados dentro de cada seção.

## 3. Implementação na Landing Page Pública
- **CustomLandingPage.tsx**: Atualizar para injetar variáveis CSS específicas para cada seção no DOM.
- **Componentes de Seção**:
  - `Hero.tsx`: Corrigir a exibição do título e descrição a partir do objeto `typography.text`.
  - `Header.tsx`: Aplicar estilos únicos aos botões (Entrar/Cadastrar).
  - `Services.tsx`, `Professionals.tsx`, `About.tsx`: Atualizar para ler as configurações granulares de fundo, títulos, cards e botões.

## Detalhes Técnicos
- Utilização de variáveis CSS escopadas (ex: `--services-section-bg`, `--services-card-radius`) para evitar vazamento de estilos.
- Manutenção da retrocompatibilidade com o objeto `theme` atual, usando fallbacks hierárquicos (Seção > Global > Default).
- Correção do erro de renderização do Hero garantindo que `typography.text` seja exibido prioritariamente.

---
**Solicitação do Usuário:** Gerar SQL das configurações para deploy manual.
