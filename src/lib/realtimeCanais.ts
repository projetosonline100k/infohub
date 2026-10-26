import type { RealtimeChannelOptions } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

// Canais ao vivo com nome único por tela (26/10, Davi: "a mensagem enviada só apareceu depois de sair e
// entrar"). As guias ficam abertas em segundo plano e várias telas iguais criavam canais com o MESMO nome no
// mesmo cliente — quando uma fechava (ou recarregava), derrubava o canal das outras e elas paravam de
// atualizar sozinhas. Aqui todo canal de "mudança no banco" ganha um sufixo próprio. Os de presença/
// broadcast (quem está no documento/projeto) passam config e precisam do nome igual: ficam como estão.
let n = 0;
const original = supabase.channel.bind(supabase);
supabase.channel = ((nome: string, opcoes?: RealtimeChannelOptions) =>
  opcoes?.config && Object.keys(opcoes.config).length ? original(nome, opcoes) : original(`${nome}~${Date.now().toString(36)}${(n++).toString(36)}`, opcoes)) as typeof supabase.channel;
