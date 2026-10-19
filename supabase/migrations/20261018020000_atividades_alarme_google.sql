-- Alarme da atividade também no Google Agenda (18/10/2026, Davi: "daria até para somar isso
-- ao calendário, no aviso do Google mesmo"). Cada alarme vira um evento curto no Google com
-- aviso na hora (toca no celular); aqui fica o id do evento para mudar/apagar junto.
ALTER TABLE public.atividades ADD COLUMN IF NOT EXISTS alarme_google_evento_id text;
NOTIFY pgrst, 'reload schema';
