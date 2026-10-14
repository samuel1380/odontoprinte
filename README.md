# ODONTOPRINT 🦷⚡

> **Sistema Empresarial Completo de Gestão e Produção 3D para Laboratórios Odontológicos**  
> Desenvolvido com **Next.js 14+ (App Router)**, **TypeScript**, **Tailwind CSS**, **Supabase PostgreSQL & Auth**, pronto para deploy no **Render**.

---

## 🌟 Visão Geral

O **ODONTOPRINT** digitaliza integralmente o fluxo de trabalho de confecção e impressão 3D de modelos odontológicos, substituindo anotações manuais e planilhas por uma plataforma SaaS de alta precisão, rastreabilidade e controle de qualidade.

### Fluxo Principal do Sistema:
1. **Cadista**: Recebe o caso, define o código do paciente (ex: `PAC-100`), seleciona entre **Fresagem** e **Impressão 3D**, e seleciona visualmente quais dos 7 modelos anatômicos serão impressos. O sistema valida que pelo menos 1 item seja selecionado antes de despachar para a fila.
2. **Fila de Impressão (FIFO)**: Organiza os pacientes e seus arquivos por ordem de entrada. Permite ao operador selecionar peças de múltiplos pacientes para compor a mesma mesa de fatiamento. Itens não selecionados permanecem na fila intactos.
3. **Fatiador & Preparo**: Aplica regras técnicas obrigatórias:
   - Permite escolher **apenas impressoras ativas com manutenção preventiva aprovada nos últimos 7 dias**.
   - Permite escolher **apenas lotes de resina com calibração técnica aprovada especificamente para aquela impressora**.
   - Exige checklist pré-impressão: *"Suportes colocados nas linhas pretas e área crítica?"* e *"Resina manipulada?"*.
   - Gera código de impressão atômico sequencial (ex: `A001`, ou prefixo `00A001` caso haja modelos de retentativa).
4. **Controle de Impressão & Falhas**:
   - Acompanhamento da ordem de impressão com cronômetro de bancada.
   - Ao finalizar, o operador responde: *"Falhou algum modelo? (SIM / NÃO)"*.
   - Se **NÃO**: todos os modelos são marcados como **CONCLUÍDO**.
   - Se **SIM**: o operador assinala quais modelos falharam e o motivo. Modelos aprovados são concluídos; **modelos que falharam incrementam a contagem de tentativas (`retry_count + 1`) e retornam imediatamente para a Fila em destaque VERMELHO como REIMPRESSÃO**.
5. **Operador de Resinas & Equipamentos**:
   - Gestão do parque de impressoras com regra estrita de 7 dias (após 7 dias sem manutenção aprovada, a máquina é bloqueada).
   - Checklist de manutenção em 7 etapas (Nivelamento, Limpeza, FEP, LED, dead pixels, luminosidade, película).
   - Cadastro de recebimento de novos lotes de resina (status inicial: *Aguardando Calibração*).
   - Bancada de calibração técnica: teste dimensional do hexágono com **tolerância milimétrica de 9,99 mm a 10,01 mm**, visibilidade de linhas, números e detalhes.

---

## 🛠️ Stack Tecnológica

- **Frontend & Backend**: Next.js 14+ (App Router), TypeScript (Strict Mode)
- **Design & UI**: Tailwind CSS com paleta corporativa (#087AA4), Shadcn UI, Lucide Icons, Sonner Toasts
- **Formulários & Validação**: React Hook Form, Zod
- **Banco de Dados & Autenticação**: Supabase PostgreSQL, Supabase Auth, Row Level Security (RLS), Realtime, Triggers e Stored Procedures atômicas (RPC)
- **Testes Automatizados**: Vitest (16 testes cobrindo todas as regras críticas de tolerância, 7 dias e retentativas)
- **Deploy**: Render Web Service (`render.yaml`)

---

## 🚀 Guia de Instalação e Execução Local

### 1. Pré-requisitos
- Node.js 18+ ou 20+ instalado
- Git instalado
- Conta gratuita no [Supabase](https://supabase.com) (ou utilize o modo demo integrado)

### 2. Instalar dependências
```bash
npm install
```

### 3. Rodar os testes de regras de negócio
```bash
npm test
```
*Todos os 16 testes de validação (tolerância do hexágono de 9.99 a 10.01 mm, bloqueio de 7 dias de manutenção, cálculo de reprovação e geração atômica de código) devem passar com 100% de sucesso.*

### 4. Configurar variáveis de ambiente
Copie o arquivo `.env.example` para `.env.local`:
```bash
cp .env.example .env.local
```
Preencha com suas credenciais do Supabase (disponíveis em **Project Settings > API**):
```env
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua-anon-key-aqui
SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key-aqui # Opcional/servidor apenas
```
> **Nota de Demonstração**: Se as credenciais do Supabase não forem inseridas imediatamente, o OdontoPrint executará de forma transparente no **Modo Demo Interativo**, já carregado com 3 impressoras (disponível, vencida e reprovada), 3 lotes de resina e 6 pacientes na fila, persistindo dados em memória local durante a apresentação!

### 5. Executar em modo desenvolvimento
```bash
npm run dev
```
Abra [http://localhost:3000](http://localhost:3000) no seu navegador.

---

## 🗄️ Configuração do Banco de Dados no Supabase Cloud

Para conectar seu próprio banco Supabase PostgreSQL em produção, basta executar o script unificado no **SQL Editor** do painel do Supabase:

1. Acesse o painel do seu projeto no Supabase > **SQL Editor**.
2. Cole e execute o arquivo `supabase/setup_completo.sql` (cria 100% da estrutura, tabelas, enums, triggers, RPCs, views e permissões operacionais de uma só vez).
3. *(Opcional)* Caso deseje carregar dados de demonstração iniciais, execute em seguida:
   - `supabase/seed.sql` (Insere as 3 impressoras em estados distintos, os lotes de resina e 6 pacientes na fila).
4. *(Bancos já existentes)* Se o seu banco já foi criado anteriormente e você precisa apenas aplicar as novidades da esteira e mesas de impressão sem perder dados:
   - `supabase/migrations/20261014_fix_mesa_print_jobs_prod.sql`

---

## 👥 Perfis de Usuário & RBAC

O sistema possui 4 perfis implementados com regras no frontend e Row Level Security no banco:

| Perfil | Descrição | Permissões |
|---|---|---|
| **ADMIN** | Diretor / Gerente Geral | Acesso total a todos os módulos, usuários, auditoria e parametrização |
| **CADISTA** | Designer CAD | Criação de trabalhos, atualização de status e visualização da fila |
| **OPERADOR_RESINA** | Técnico de Equipamentos | Parque de impressoras, checklists de manutenção, recebimento e calibração de resinas |
| **OPERADOR_IMPRESSAO** | Operador de Manufatura 3D | Fila FIFO, fatiamento, execução de impressões e controle de falhas/reimpressão |

> 💡 **Recurso para Reuniões Executivas**: No canto superior direito da tela (Topbar), você encontra o seletor rápido de perfis. Com um clique, você pode alternar instantaneamente entre **Cadista**, **Operador de Impressão**, **Operador de Resina** e **Administrador** para demonstrar cada perspectiva da equipe durante a apresentação!

---

## 🎬 Roteiro de Demonstração Oficial (Critério de Aceite 35)

Para demonstrar o fluxo completo de ponta a ponta na reunião com a diretoria:

1. **Login como Cadista**:
   - Acesse `/login` e clique em **Dra. Juliana Ribeiro (Cadista)** ou use o seletor no Topbar.
   - No menu lateral, acesse **Cadista: Status** (`/cadista/status`).
   - Digite o código do paciente: `PAC-100`.
   - Selecione a opção **IMPRESSÃO 3D**.
   - No box de arquivos, marque:
     - [x] **Modelo de Trabalho**
     - [x] **Antagonista**
     - [x] **Troquel**
   - *(Teste a regra fundamental)*: Desmarque todos e tente salvar — o sistema exibirá o aviso *"Selecione pelo menos um arquivo para continuar"*.
   - Marque os 3 arquivos novamente e clique em **Confirmar e Enviar para Fila de Impressão**.

2. **Login como Operador de Impressão**:
   - No Topbar, alterne o perfil para **Lucas Mendes (Operador de Impressão)**.
   - Acesse a **Fila de Impressão** (`/fila`).
   - O card do paciente **PAC-100** aparecerá na fila contendo os 3 modelos solicitados.
   - No card do `PAC-100`, selecione apenas:
     - [x] **Modelo de Trabalho**
     - [x] **Antagonista**
     - *(Deixe o **Troquel** desmarcado)*.
   - Clique no botão **Preparar no Fatiador (2)**.

3. **Fatiador & Preparo**:
   - Na tela do Fatiador (`/fatiador`), observe que:
     - No dropdown de impressoras, **apenas a Odonto Printer 01** (com manutenção em dia) está liberada. As demais explicam o motivo do bloqueio (manutenção vencida há 10 dias ou reprovada).
     - No dropdown de resinas, **apenas a resina calibrada para a Odonto Printer 01** está disponível.
   - Confirme as duas checagens obrigatórias:
     - [x] Suportes colocados nas áreas críticas? -> **SIM**
     - [x] Resina manipulada? -> **SIM**
   - Clique em **Gerar Nomenclatura de Impressão** -> o código sequencial atômico `A003` (ou `A001`) será gerado.
   - Clique no botão verde **INICIAR IMPRESSÃO**.

4. **Execução & Apontamento de Falha**:
   - O sistema abrirá a ordem de impressão em andamento (`/impressoes/[id]`).
   - Clique no botão **IMPRESSÃO FINALIZADA**.
   - O modal perguntará: *"Falhou algum modelo durante a impressão?"* -> Clique em **SIM (Houve Falha)**.
   - Na lista que se abre:
     - [x] Marque **PAC-100 • Antagonista** como falho (digite o motivo: *"Descolamento do suporte"*).
     - Deixe o **Modelo de Trabalho** desmarcado (aprovado).
   - Clique em **Confirmar Falhas e Concluir Ordem**.

5. **Verificação do Resultado**:
   - Acesse a **Fila de Impressão** (`/fila`):
     - O **Antagonista** do `PAC-100` retornou automaticamente para a fila, **destacado em VERMELHO**, com a badge **REIMPRESSÃO (Tentativa 2)** e o motivo da falha gravado.
     - O **Troquel** do `PAC-100` **continua intacto na fila**, pois nunca havia sido selecionado.
   - Acesse o **Histórico Completo** (`/historico`):
     - Pesquise por `PAC-100` e abra a **Linha do Tempo**.
     - Toda a jornada estará registrada: Criação pelo Cadista -> Entrada na Fila -> Fatiamento -> Início da Impressão -> Modelo de Trabalho Concluído -> Falha do Antagonista e Retorno à Fila.

---

## ☁️ Deploy no Render (Web Service)

O projeto está 100% configurado para deploy no **Render** através do arquivo `render.yaml`.

### Passo a passo para publicação:
1. Envie o projeto para seu repositório no GitHub:
   ```bash
   git init
   git add .
   git commit -m "feat: Sistema completo OdontoPrint"
   git branch -M main
   git remote add origin https://github.com/seu-usuario/odontoprint.git
   git push -u origin main
   ```
2. Acesse seu painel no [Render](https://dashboard.render.com).
3. Clique em **New +** > **Web Service**.
4. Conecte seu repositório GitHub.
5. Configure os comandos:
   - **Environment**: `Node`
   - **Build Command**: `npm ci && npm run build`
   - **Start Command**: `npm start`
6. Na seção **Environment Variables**, adicione:
   - `NODE_ENV` = `production`
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://seu-projeto.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = `sua-chave-anon`
   - `SUPABASE_SERVICE_ROLE_KEY` = `sua-chave-service-role` *(se necessário no servidor)*
7. Clique em **Deploy Web Service**.
8. O Render construirá e publicará a aplicação com certificado HTTPS automático!

---

## 📄 Licença

Propriedade exclusiva para demonstração empresarial e uso de laboratórios odontológicos.
ODONTOPRINT &copy; Todos os direitos reservados.
