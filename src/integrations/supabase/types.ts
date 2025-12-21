export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      agentes_ia: {
        Row: {
          cliente_id: string
          created_at: string
          id: string
          instrucoes: string | null
          nome: string
          persona: string | null
          tom_voz: string | null
          updated_at: string
        }
        Insert: {
          cliente_id: string
          created_at?: string
          id?: string
          instrucoes?: string | null
          nome?: string
          persona?: string | null
          tom_voz?: string | null
          updated_at?: string
        }
        Update: {
          cliente_id?: string
          created_at?: string
          id?: string
          instrucoes?: string | null
          nome?: string
          persona?: string | null
          tom_voz?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      categorias_nucleo: {
        Row: {
          cliente_id: string
          cor: string
          created_at: string
          id: string
          ordem: number
          subtitulo: string | null
          titulo: string
        }
        Insert: {
          cliente_id: string
          cor?: string
          created_at?: string
          id?: string
          ordem?: number
          subtitulo?: string | null
          titulo: string
        }
        Update: {
          cliente_id?: string
          cor?: string
          created_at?: string
          id?: string
          ordem?: number
          subtitulo?: string | null
          titulo?: string
        }
        Relationships: []
      }
      clientes: {
        Row: {
          created_at: string | null
          id: string
          idade: number
          link_painel_receita: string | null
          meta_atual: string | null
          nicho: string
          nome_especialista: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          idade: number
          link_painel_receita?: string | null
          meta_atual?: string | null
          nicho: string
          nome_especialista: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          idade?: number
          link_painel_receita?: string | null
          meta_atual?: string | null
          nicho?: string
          nome_especialista?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      conhecimentos_agente: {
        Row: {
          agente_id: string | null
          arquivo_url: string | null
          caracteres: number | null
          cliente_id: string
          conteudo_extraido: string | null
          created_at: string | null
          id: string
          nome: string
          tipo: string | null
        }
        Insert: {
          agente_id?: string | null
          arquivo_url?: string | null
          caracteres?: number | null
          cliente_id: string
          conteudo_extraido?: string | null
          created_at?: string | null
          id?: string
          nome: string
          tipo?: string | null
        }
        Update: {
          agente_id?: string | null
          arquivo_url?: string | null
          caracteres?: number | null
          cliente_id?: string
          conteudo_extraido?: string | null
          created_at?: string | null
          id?: string
          nome?: string
          tipo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conhecimentos_agente_agente_id_fkey"
            columns: ["agente_id"]
            isOneToOne: false
            referencedRelation: "agentes_ia"
            referencedColumns: ["id"]
          },
        ]
      }
      equipe_cliente: {
        Row: {
          cliente_id: string
          created_at: string | null
          id: string
          nome_pessoa: string
          papel: string
        }
        Insert: {
          cliente_id: string
          created_at?: string | null
          id?: string
          nome_pessoa: string
          papel: string
        }
        Update: {
          cliente_id?: string
          created_at?: string | null
          id?: string
          nome_pessoa?: string
          papel?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipe_cliente_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      ideias_conteudo: {
        Row: {
          cliente_id: string
          created_at: string
          descricao: string | null
          id: string
          link_referencia: string | null
          plataformas: string[] | null
          status: string | null
          titulo: string
        }
        Insert: {
          cliente_id: string
          created_at?: string
          descricao?: string | null
          id?: string
          link_referencia?: string | null
          plataformas?: string[] | null
          status?: string | null
          titulo: string
        }
        Update: {
          cliente_id?: string
          created_at?: string
          descricao?: string | null
          id?: string
          link_referencia?: string | null
          plataformas?: string[] | null
          status?: string | null
          titulo?: string
        }
        Relationships: []
      }
      nucleo_influencia: {
        Row: {
          categoria: string
          cliente_id: string
          created_at: string
          id: string
          ordem: number
          texto: string
        }
        Insert: {
          categoria: string
          cliente_id: string
          created_at?: string
          id?: string
          ordem?: number
          texto: string
        }
        Update: {
          categoria?: string
          cliente_id?: string
          created_at?: string
          id?: string
          ordem?: number
          texto?: string
        }
        Relationships: []
      }
      perfis_parecidos: {
        Row: {
          cliente_id: string
          created_at: string
          descricao: string | null
          id: string
          imagem_url: string | null
          link_perfil: string | null
          nome: string
          ordem: number
          plataforma: string | null
        }
        Insert: {
          cliente_id: string
          created_at?: string
          descricao?: string | null
          id?: string
          imagem_url?: string | null
          link_perfil?: string | null
          nome: string
          ordem?: number
          plataforma?: string | null
        }
        Update: {
          cliente_id?: string
          created_at?: string
          descricao?: string | null
          id?: string
          imagem_url?: string | null
          link_perfil?: string | null
          nome?: string
          ordem?: number
          plataforma?: string | null
        }
        Relationships: []
      }
      perguntas_pesquisa: {
        Row: {
          created_at: string
          id: string
          obrigatoria: boolean | null
          opcoes: Json | null
          ordem: number
          pesquisa_id: string
          secao: number
          tipo: Database["public"]["Enums"]["tipo_pesquisa"]
          titulo: string
        }
        Insert: {
          created_at?: string
          id?: string
          obrigatoria?: boolean | null
          opcoes?: Json | null
          ordem: number
          pesquisa_id: string
          secao?: number
          tipo: Database["public"]["Enums"]["tipo_pesquisa"]
          titulo: string
        }
        Update: {
          created_at?: string
          id?: string
          obrigatoria?: boolean | null
          opcoes?: Json | null
          ordem?: number
          pesquisa_id?: string
          secao?: number
          tipo?: Database["public"]["Enums"]["tipo_pesquisa"]
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "perguntas_pesquisa_pesquisa_id_fkey"
            columns: ["pesquisa_id"]
            isOneToOne: false
            referencedRelation: "pesquisas"
            referencedColumns: ["id"]
          },
        ]
      }
      pesquisas: {
        Row: {
          banner_url: string | null
          cliente_id: string
          created_at: string
          id: string
          link_final: string | null
          link_final_texto: string | null
          link_publico: string
          mensagem_final: string | null
          mensagem_inicial: string | null
          opcoes: Json | null
          tipo: Database["public"]["Enums"]["tipo_pesquisa"]
          titulo: string | null
          titulo_pergunta: string
        }
        Insert: {
          banner_url?: string | null
          cliente_id: string
          created_at?: string
          id?: string
          link_final?: string | null
          link_final_texto?: string | null
          link_publico: string
          mensagem_final?: string | null
          mensagem_inicial?: string | null
          opcoes?: Json | null
          tipo: Database["public"]["Enums"]["tipo_pesquisa"]
          titulo?: string | null
          titulo_pergunta: string
        }
        Update: {
          banner_url?: string | null
          cliente_id?: string
          created_at?: string
          id?: string
          link_final?: string | null
          link_final_texto?: string | null
          link_publico?: string
          mensagem_final?: string | null
          mensagem_inicial?: string | null
          opcoes?: Json | null
          tipo?: Database["public"]["Enums"]["tipo_pesquisa"]
          titulo?: string | null
          titulo_pergunta?: string
        }
        Relationships: [
          {
            foreignKeyName: "pesquisas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      produtos_cliente: {
        Row: {
          cliente_id: string
          created_at: string
          id: string
          nome_produto: string
          preco: string | null
          status: string | null
        }
        Insert: {
          cliente_id: string
          created_at?: string
          id?: string
          nome_produto: string
          preco?: string | null
          status?: string | null
        }
        Update: {
          cliente_id?: string
          created_at?: string
          id?: string
          nome_produto?: string
          preco?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "produtos_cliente_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      respostas_pesquisa: {
        Row: {
          created_at: string
          id: string
          pergunta_id: string | null
          pesquisa_id: string
          respondente_id: string | null
          resposta_texto: string | null
          respostas_selecionadas: Json | null
        }
        Insert: {
          created_at?: string
          id?: string
          pergunta_id?: string | null
          pesquisa_id: string
          respondente_id?: string | null
          resposta_texto?: string | null
          respostas_selecionadas?: Json | null
        }
        Update: {
          created_at?: string
          id?: string
          pergunta_id?: string | null
          pesquisa_id?: string
          respondente_id?: string | null
          resposta_texto?: string | null
          respostas_selecionadas?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "respostas_pesquisa_pergunta_id_fkey"
            columns: ["pergunta_id"]
            isOneToOne: false
            referencedRelation: "perguntas_pesquisa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "respostas_pesquisa_pesquisa_id_fkey"
            columns: ["pesquisa_id"]
            isOneToOne: false
            referencedRelation: "pesquisas"
            referencedColumns: ["id"]
          },
        ]
      }
      tags_video: {
        Row: {
          cliente_id: string
          cor: string
          created_at: string
          id: string
          nome: string
        }
        Insert: {
          cliente_id: string
          cor?: string
          created_at?: string
          id?: string
          nome: string
        }
        Update: {
          cliente_id?: string
          cor?: string
          created_at?: string
          id?: string
          nome?: string
        }
        Relationships: []
      }
      termos_virais: {
        Row: {
          categoria: string | null
          cliente_id: string
          created_at: string
          id: string
          ordem: number | null
          termo: string
        }
        Insert: {
          categoria?: string | null
          cliente_id: string
          created_at?: string
          id?: string
          ordem?: number | null
          termo: string
        }
        Update: {
          categoria?: string | null
          cliente_id?: string
          created_at?: string
          id?: string
          ordem?: number | null
          termo?: string
        }
        Relationships: []
      }
      videos_referencia: {
        Row: {
          cliente_id: string
          created_at: string
          id: string
          link_video: string | null
          ordem: number
          plataforma: string | null
          thumbnail_url: string | null
          titulo: string
        }
        Insert: {
          cliente_id: string
          created_at?: string
          id?: string
          link_video?: string | null
          ordem?: number
          plataforma?: string | null
          thumbnail_url?: string | null
          titulo: string
        }
        Update: {
          cliente_id?: string
          created_at?: string
          id?: string
          link_video?: string | null
          ordem?: number
          plataforma?: string | null
          thumbnail_url?: string | null
          titulo?: string
        }
        Relationships: []
      }
      videos_vertical: {
        Row: {
          cliente_id: string
          created_at: string
          descricao: string | null
          escalado: boolean
          id: string
          ordem: number
          referencia_id: string | null
          roteiro: string | null
          status: string
          titulo: string
        }
        Insert: {
          cliente_id: string
          created_at?: string
          descricao?: string | null
          escalado?: boolean
          id?: string
          ordem?: number
          referencia_id?: string | null
          roteiro?: string | null
          status?: string
          titulo: string
        }
        Update: {
          cliente_id?: string
          created_at?: string
          descricao?: string | null
          escalado?: boolean
          id?: string
          ordem?: number
          referencia_id?: string | null
          roteiro?: string | null
          status?: string
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "videos_vertical_referencia_id_fkey"
            columns: ["referencia_id"]
            isOneToOne: false
            referencedRelation: "videos_referencia"
            referencedColumns: ["id"]
          },
        ]
      }
      videos_vertical_tags: {
        Row: {
          created_at: string
          id: string
          tag_id: string
          video_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          tag_id: string
          video_id: string
        }
        Update: {
          created_at?: string
          id?: string
          tag_id?: string
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "videos_vertical_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags_video"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "videos_vertical_tags_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos_vertical"
            referencedColumns: ["id"]
          },
        ]
      }
      videos_youtube: {
        Row: {
          cliente_id: string
          created_at: string
          descricao: string | null
          id: string
          ordem: number
          roteiro: string | null
          status: string
          titulo: string
        }
        Insert: {
          cliente_id: string
          created_at?: string
          descricao?: string | null
          id?: string
          ordem?: number
          roteiro?: string | null
          status?: string
          titulo: string
        }
        Update: {
          cliente_id?: string
          created_at?: string
          descricao?: string | null
          id?: string
          ordem?: number
          roteiro?: string | null
          status?: string
          titulo?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      tipo_pesquisa: "aberta" | "multipla" | "unica"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      tipo_pesquisa: ["aberta", "multipla", "unica"],
    },
  },
} as const
