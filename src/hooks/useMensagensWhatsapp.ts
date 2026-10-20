import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { clienteDoGrupo, ehGrupoDeCliente } from "@/lib/whatsapp/shirley";

// Mensagem nova no WhatsApp conectado → aviso na orbe do Atlas, na hora
// (16/10, Davi: "hoje eu só sei se mandaram mensagem se abrir"). Ouve as
// mensagens novas ao vivo (realtime de whatsapp_mensagens). Conversas
// individuais e grupos de cliente da Core; os outros grupos ficam de fora
// (barulho). Várias mensagens da mesma conversa viram um aviso só ("+2").
export interface MensagemNova {
  chatId: string; chatNome: string | null; nome: string; grupo: boolean; autor: string | null; texto: string; quando: string; quantas: number;
}
interface Linha {
  chat_id: string; chat_nome: string | null; eh_grupo: boolean; de_mim: boolean; autor_nome: string | null;
  tipo: string; texto: string | null; transcricao: string | null; enviada_em: string;
}
const ROTULO: Record<string, string> = { audio: "🎤 Áudio", imagem: "📷 Foto", video: "🎥 Vídeo", documento: "📄 Documento", figurinha: "Figurinha" };
const CHAVE_VISTAS = "jarvis:whatsapp-vistas";   // a mesma da guia Conversas: conversa aberta lá não avisa
const lidaAte = (chatId: string): string => { try { return (JSON.parse(localStorage.getItem(CHAVE_VISTAS) || "{}") as Record<string, string>)[chatId] ?? ""; } catch { return ""; } };

export function useMensagensWhatsapp(meuId: string | undefined, ativo: boolean) {
  const [fila, setFila] = useState<MensagemNova[]>([]);

  useEffect(() => {
    if (!ativo || !meuId) return;
    const canal = supabase.channel("atlas-whatsapp-avisos")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "whatsapp_mensagens", filter: `user_id=eq.${meuId}` }, (ev) => {
        const m = ev.new as Linha;
        if (!m?.chat_id) return;
        // Só o número principal (o dos clientes) avisa no Atlas; o pessoal do Davi não (20/10).
        if (((m as unknown as { conta?: string }).conta ?? "principal") !== "principal") return;
        // Respondeu (pelo celular ou pelo Mac): o aviso daquela conversa sai.
        if (m.de_mim) { setFila((xs) => xs.filter((x) => x.chatId !== m.chat_id)); return; }
        if (m.eh_grupo && !ehGrupoDeCliente(m.chat_nome)) return;
        if (lidaAte(m.chat_id) >= m.enviada_em) return;
        // Mensagem velha chegando atrasada (o receptor reprocessou): não avisa.
        if (Date.now() - new Date(m.enviada_em).getTime() > 30 * 60_000) return;
        const texto = (m.texto || m.transcricao || ROTULO[m.tipo] || "Mensagem").replace(/\s+/g, " ").trim().slice(0, 160);
        const nome = m.eh_grupo && m.chat_nome ? clienteDoGrupo(m.chat_nome) : m.chat_nome || m.autor_nome || "Alguém";
        setFila((xs) => {
          const antes = xs.find((x) => x.chatId === m.chat_id);
          const novo: MensagemNova = { chatId: m.chat_id, chatNome: m.chat_nome, nome, grupo: m.eh_grupo, autor: m.eh_grupo ? m.autor_nome : null, texto, quando: m.enviada_em, quantas: (antes?.quantas ?? 0) + 1 };
          return [...xs.filter((x) => x.chatId !== m.chat_id), novo].slice(-15);
        });
      })
      .subscribe();
    return () => { void supabase.removeChannel(canal); };
  }, [ativo, meuId]);

  const dispensar = useCallback((chatId?: string) => setFila((xs) => (chatId ? xs.filter((x) => x.chatId !== chatId) : xs.slice(1))), []);
  return { atual: fila[0] ?? null, restantes: Math.max(0, fila.length - 1), todas: fila, dispensar };
}

/** Deixa a guia WhatsApp do Atlas já com esta conversa aberta (a guia lê isso ao abrir). */
export function prepararConversaAberta(m: MensagemNova) {
  try {
    localStorage.setItem("jarvis:whatsapp-modo", "conversas");
    localStorage.setItem("jarvis:whatsapp-conversa-aberta", JSON.stringify({
      chat_id: m.chatId, chat_nome: m.chatNome ?? m.nome, eh_grupo: m.grupo, ultima_em: m.quando, ultima_de_mim: false,
      ultima_tipo: "texto", ultima_texto: m.texto, ultima_autor: m.autor, total: 1,
    }));
  } catch { /* sem storage */ }
}
