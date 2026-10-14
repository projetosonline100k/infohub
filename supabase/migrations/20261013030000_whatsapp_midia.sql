-- Fotos, vídeos e áudios do WhatsApp ficam no Mac do Davi
-- (~/.infopro-hub/whatsapp/midia), servidos pelo receptor só pra ele; aqui
-- fica só o nome do arquivo. Sem arquivo = mídia antiga que o WhatsApp não
-- reenvia (aparece só o rótulo).
ALTER TABLE public.whatsapp_mensagens ADD COLUMN IF NOT EXISTS midia_arquivo text;
NOTIFY pgrst, 'reload schema';
