import { useState } from "react";
import { Plus, X, Edit2, Youtube, Instagram, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Perfil {
  id: string;
  nome: string;
  descricao?: string;
  imagem_url?: string;
  ordem: number;
  link_perfil?: string;
  plataforma?: string;
}

interface PerfilCardProps {
  perfil: Perfil | null;
  onAdd: (plataforma: string) => void;
  onUpdate: (id: string, dados: Partial<Perfil>) => void;
  onDelete: (id: string) => void;
  filtroAtual?: string;
}

export function PerfilCard({ perfil, onAdd, onUpdate, onDelete, filtroAtual }: PerfilCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [nome, setNome] = useState(perfil?.nome || "");
  const [descricao, setDescricao] = useState(perfil?.descricao || "");
  const [linkPerfil, setLinkPerfil] = useState(perfil?.link_perfil || "");
  const [plataforma, setPlataforma] = useState(perfil?.plataforma || "conteudo_curto");

  const handleSave = () => {
    if (perfil) {
      onUpdate(perfil.id, { nome, descricao, link_perfil: linkPerfil, plataforma });
    }
    setIsEditing(false);
  };

  const handleAdd = () => {
    // Usar o filtro atual para definir a plataforma padrão
    const plataformaPadrao = filtroAtual === "youtube" ? "youtube" : 
                              filtroAtual === "conteudo_curto" ? "conteudo_curto" : 
                              "conteudo_curto";
    onAdd(plataformaPadrao);
  };

  const openLink = () => {
    if (perfil?.link_perfil) {
      window.open(perfil.link_perfil, "_blank");
    }
  };

  const PlataformaIcon = perfil?.plataforma === "youtube" ? Youtube : Instagram;

  if (!perfil) {
    return (
      <button
        onClick={handleAdd}
        className="aspect-square border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center gap-2 hover:border-primary hover:bg-muted/50 transition-colors cursor-pointer"
      >
        <Plus className="h-8 w-8 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Adicionar perfil</span>
      </button>
    );
  }

  return (
    <>
      <div className="aspect-square border border-border rounded-lg p-3 bg-card relative group flex flex-col">
        {/* Ações */}
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
          {perfil.link_perfil && (
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              onClick={openLink}
            >
              <ExternalLink className="h-3 w-3" />
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={() => {
              setNome(perfil.nome);
              setDescricao(perfil.descricao || "");
              setLinkPerfil(perfil.link_perfil || "");
              setPlataforma(perfil.plataforma || "conteudo_curto");
              setIsEditing(true);
            }}
          >
            <Edit2 className="h-3 w-3" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={() => onDelete(perfil.id)}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>

        {/* Ícone da plataforma */}
        <div className="absolute top-2 left-2">
          <PlataformaIcon className="h-4 w-4 text-muted-foreground" />
        </div>

        {/* Conteúdo */}
        <div className="flex-1 flex flex-col pt-4">
          <h4 className="font-medium text-sm mb-1 line-clamp-1">{perfil.nome}</h4>
          {perfil.link_perfil && (
            <a 
              href={perfil.link_perfil} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline truncate mb-1"
            >
              {perfil.link_perfil.replace(/https?:\/\/(www\.)?/, '').slice(0, 25)}...
            </a>
          )}
          <p className="text-xs text-muted-foreground line-clamp-2 flex-1">
            {perfil.descricao || "Clique para editar"}
          </p>
        </div>
      </div>

      {/* Modal de edição */}
      <Dialog open={isEditing} onOpenChange={setIsEditing}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar perfil</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome do perfil</Label>
              <Input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex: @fulano"
              />
            </div>
            <div>
              <Label>Link do perfil</Label>
              <Input
                value={linkPerfil}
                onChange={(e) => setLinkPerfil(e.target.value)}
                placeholder="https://instagram.com/..."
              />
            </div>
            <div>
              <Label>Plataforma</Label>
              <RadioGroup value={plataforma} onValueChange={setPlataforma} className="flex gap-4 mt-2">
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="youtube" id="youtube" />
                  <Label htmlFor="youtube" className="flex items-center gap-1 cursor-pointer">
                    <Youtube className="h-4 w-4" /> YouTube
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="conteudo_curto" id="conteudo_curto" />
                  <Label htmlFor="conteudo_curto" className="flex items-center gap-1 cursor-pointer">
                    <Instagram className="h-4 w-4" /> Conteúdo Curto
                  </Label>
                </div>
              </RadioGroup>
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Por que esse perfil é uma referência?"
                rows={4}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsEditing(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSave}>Salvar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
