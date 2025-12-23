import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Send, Sparkles, Copy, Check, Loader2, Settings, ChevronDown, Plus, X, Pencil, Replace } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AgentConfigModal } from "./AgentConfig";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface AgentConfig {
  id?: string;
  nome: string;
  persona: string;
  instrucoes: string;
  tom_voz: string;
}

interface SelectionContext {
  text: string;
  range: { start: number; end: number };
}

interface RoteiroChatProps {
  clienteId: string;
  titulo: string;
  descricao: string;
  onInsertText: (text: string) => void;
  selectedContext?: SelectionContext | null;
  onClearSelection?: () => void;
  onReplaceText?: (text: string, range: { start: number; end: number }) => void;
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;

export function RoteiroChat({ clienteId, titulo, descricao, onInsertText, selectedContext, onClearSelection, onReplaceText }: RoteiroChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<AgentConfig | null>(null);
  const [showAgentConfig, setShowAgentConfig] = useState(false);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (clienteId) {
      fetchAgents();
    }
  }, [clienteId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const fetchAgents = async () => {
    const { data } = await supabase
      .from("agentes_ia")
      .select("id, nome, persona, instrucoes, tom_voz")
      .eq("cliente_id", clienteId)
      .order("created_at", { ascending: true });

    if (data && data.length > 0) {
      setAgents(data);
      // Select first agent if none selected
      if (!selectedAgent) {
        setSelectedAgent(data[0]);
      }
    }
  };

  const streamChat = async (userMessages: Message[]) => {
    const resp = await fetch(CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({
        messages: userMessages,
        context: { titulo, descricao },
        agentConfig: selectedAgent,
        agentId: selectedAgent?.id,
        selectedText: selectedContext?.text || null,
      }),
    });

    if (!resp.ok) {
      if (resp.status === 429) {
        throw new Error("Rate limit exceeded. Try again later.");
      }
      if (resp.status === 402) {
        throw new Error("Payment required. Add credits to continue.");
      }
      throw new Error("Failed to get response");
    }

    if (!resp.body) throw new Error("No response body");

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let textBuffer = "";
    let assistantContent = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      textBuffer += decoder.decode(value, { stream: true });

      let newlineIndex: number;
      while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
        let line = textBuffer.slice(0, newlineIndex);
        textBuffer = textBuffer.slice(newlineIndex + 1);

        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (line.startsWith(":") || line.trim() === "") continue;
        if (!line.startsWith("data: ")) continue;

        const jsonStr = line.slice(6).trim();
        if (jsonStr === "[DONE]") break;

        try {
          const parsed = JSON.parse(jsonStr);
          const content = parsed.choices?.[0]?.delta?.content as string | undefined;
          if (content) {
            assistantContent += content;
            setMessages(prev => {
              const last = prev[prev.length - 1];
              if (last?.role === "assistant") {
                return prev.map((m, i) => 
                  i === prev.length - 1 ? { ...m, content: assistantContent } : m
                );
              }
              return [...prev, { role: "assistant", content: assistantContent }];
            });
          }
        } catch {
          textBuffer = line + "\n" + textBuffer;
          break;
        }
      }
    }
  };

  const handleSend = async (customMessage?: string) => {
    const messageText = customMessage || input.trim();
    if (!messageText || isLoading) return;

    const userMsg: Message = { role: "user", content: messageText };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);

    try {
      await streamChat(newMessages);
    } catch (error) {
      console.error("Chat error:", error);
      toast.error(error instanceof Error ? error.message : "Erro ao enviar mensagem");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateRoteiro = () => {
    const prompt = titulo 
      ? `Gere um roteiro completo para um vídeo curto com o tema: "${titulo}"${descricao ? `. Contexto adicional: ${descricao}` : ""}`
      : "Gere um roteiro para um vídeo curto viral. Me pergunte sobre o tema se precisar.";
    handleSend(prompt);
  };

  const handleCopy = (content: string, index: number) => {
    navigator.clipboard.writeText(content);
    setCopiedIndex(index);
    toast.success("Copiado!");
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleInsert = (content: string) => {
    onInsertText(content);
    toast.success("Inserido no roteiro!");
  };

  const handleReplace = (content: string) => {
    if (selectedContext && onReplaceText) {
      onReplaceText(content, selectedContext.range);
      onClearSelection?.();
      toast.success("Texto substituído!");
    }
  };

  const handleSelectAgent = (agent: AgentConfig) => {
    setSelectedAgent(agent);
    toast.success(`Agente alterado para: ${agent.nome}`);
  };

  const handleCreateNewAgent = () => {
    setIsCreatingNew(true);
    setShowAgentConfig(true);
  };

  const handleEditAgent = () => {
    setIsCreatingNew(false);
    setShowAgentConfig(true);
  };

  const handleAgentSaved = (config: AgentConfig) => {
    fetchAgents();
    if (config.id) {
      setSelectedAgent(config);
    }
  };

  return (
    <div className="flex flex-col h-full bg-muted/30 rounded-lg border overflow-hidden">
      {/* Header with Agent Selector */}
      <div className="flex items-center justify-between p-3 border-b bg-background/50 shrink-0">
        <div className="flex items-center gap-2 flex-1">
          <Sparkles className="h-4 w-4 text-primary shrink-0" />
          
          {/* Agent Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 px-2 font-medium text-sm gap-1">
                {selectedAgent?.nome || "Selecionar Agente"}
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              {agents.map((agent) => (
                <DropdownMenuItem
                  key={agent.id}
                  onClick={() => handleSelectAgent(agent)}
                  className="flex items-center gap-2"
                >
                  <span className={`h-2 w-2 rounded-full ${selectedAgent?.id === agent.id ? 'bg-primary' : 'bg-muted-foreground/30'}`} />
                  <span className="flex-1 truncate">{agent.nome}</span>
                </DropdownMenuItem>
              ))}
              {agents.length > 0 && <DropdownMenuSeparator />}
              <DropdownMenuItem onClick={handleCreateNewAgent} className="text-primary">
                <Plus className="h-4 w-4 mr-2" />
                Criar novo agente
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={handleEditAgent}
          title="Configurar agente"
          disabled={!selectedAgent}
        >
          <Settings className="h-4 w-4" />
        </Button>
      </div>

      {/* Selection Context Badge */}
      {selectedContext && (
        <div className="px-3 py-2 border-b bg-primary/5 shrink-0">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="gap-1.5 pr-1 max-w-full">
              <Pencil className="h-3 w-3 shrink-0" />
              <span className="truncate text-xs">
                Editando: "{selectedContext.text.length > 40 ? selectedContext.text.slice(0, 40) + '...' : selectedContext.text}"
              </span>
              <Button
                size="icon"
                variant="ghost"
                className="h-4 w-4 ml-1 hover:bg-destructive/20"
                onClick={onClearSelection}
              >
                <X className="h-3 w-3" />
              </Button>
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Suas mensagens serão usadas para editar este trecho
          </p>
        </div>
      )}

      {/* Messages - scrollable area */}
      <div className="flex-1 overflow-y-auto min-h-0 p-3" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            <Sparkles className="h-8 w-8 mx-auto mb-3 opacity-50" />
            <p>Use a IA para criar roteiros</p>
            <p className="text-xs mt-1">Clique em "Gerar roteiro" ou escreva sua dúvida</p>
            {selectedAgent && (
              <p className="text-xs mt-3 text-primary">
                Agente: {selectedAgent.nome}
              </p>
            )}
            {!selectedAgent && agents.length === 0 && (
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={handleCreateNewAgent}
              >
                <Plus className="h-4 w-4 mr-2" />
                Criar primeiro agente
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[90%] rounded-lg p-3 text-sm ${
                  msg.role === "user" 
                    ? "bg-primary text-primary-foreground" 
                    : "bg-background border"
                }`}>
                  <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                  {msg.role === "assistant" && msg.content && (
                    <div className="flex gap-1 mt-2 pt-2 border-t border-border/50 flex-wrap">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-xs"
                        onClick={() => handleCopy(msg.content, i)}
                      >
                        {copiedIndex === i ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                        Copiar
                      </Button>
                      {selectedContext && onReplaceText ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 text-xs text-primary"
                          onClick={() => handleReplace(msg.content)}
                        >
                          <Replace className="h-3 w-3 mr-1" />
                          Substituir no roteiro
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 text-xs"
                          onClick={() => handleInsert(msg.content)}
                        >
                          Inserir no roteiro
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {isLoading && messages[messages.length - 1]?.role === "user" && (
              <div className="flex justify-start">
                <div className="bg-background border rounded-lg p-3">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Quick actions */}
      <div className="px-3 py-2 border-t flex gap-2 flex-wrap shrink-0">
        <Button
          size="sm"
          variant="secondary"
          className="text-xs h-7"
          onClick={handleGenerateRoteiro}
          disabled={isLoading}
        >
          <Sparkles className="h-3 w-3 mr-1" />
          Gerar roteiro
        </Button>
        <Button
          size="sm"
          variant="secondary"
          className="text-xs h-7"
          onClick={() => handleSend("Me ajude a melhorar o gancho inicial do roteiro")}
          disabled={isLoading}
        >
          Melhorar hook
        </Button>
        <Button
          size="sm"
          variant="secondary"
          className="text-xs h-7"
          onClick={() => handleSend("Sugira um CTA forte para o final do vídeo")}
          disabled={isLoading}
        >
          Sugerir CTA
        </Button>
      </div>

      {/* Input */}
      <div className="p-3 border-t shrink-0">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex gap-2"
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Digite sua mensagem..."
            className="flex-1 text-sm"
            disabled={isLoading}
          />
          <Button type="submit" size="icon" disabled={isLoading || !input.trim()}>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>
      </div>

      {/* Agent Config Modal */}
      <AgentConfigModal
        clienteId={clienteId}
        agentId={isCreatingNew ? undefined : selectedAgent?.id}
        open={showAgentConfig}
        onOpenChange={setShowAgentConfig}
        onSave={handleAgentSaved}
      />
    </div>
  );
}
