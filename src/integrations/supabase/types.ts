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
      atividades: {
        Row: {
          alarme_em: string | null
          alarme_lembrete_id: string | null
          cliente_id: string | null
          concluida: boolean
          concluida_em: string | null
          created_at: string
          data_atividade: string
          data_inicio: string | null
          data_vencimento: string | null
          deleted_at: string | null
          descricao: string | null
          destaque: boolean
          id: string
          ordem: number
          pasta_id: string | null
          prioridade: string
          responsavel_nome: string | null
          status: string
          tempo_descanso: number | null
          tempo_estimado: number | null
          timer_decorrido_segundos: number
          timer_iniciado_em: string | null
          titulo: string
        }
        Insert: {
          alarme_em?: string | null
          alarme_lembrete_id?: string | null
          cliente_id?: string | null
          concluida?: boolean
          concluida_em?: string | null
          created_at?: string
          data_atividade?: string
          data_inicio?: string | null
          data_vencimento?: string | null
          deleted_at?: string | null
          descricao?: string | null
          destaque?: boolean
          id?: string
          ordem?: number
          pasta_id?: string | null
          prioridade?: string
          responsavel_nome?: string | null
          status?: string
          tempo_descanso?: number | null
          tempo_estimado?: number | null
          timer_decorrido_segundos?: number
          timer_iniciado_em?: string | null
          titulo: string
        }
        Update: {
          alarme_em?: string | null
          alarme_lembrete_id?: string | null
          cliente_id?: string | null
          concluida?: boolean
          concluida_em?: string | null
          created_at?: string
          data_atividade?: string
          data_inicio?: string | null
          data_vencimento?: string | null
          deleted_at?: string | null
          descricao?: string | null
          destaque?: boolean
          id?: string
          ordem?: number
          pasta_id?: string | null
          prioridade?: string
          responsavel_nome?: string | null
          status?: string
          tempo_descanso?: number | null
          tempo_estimado?: number | null
          timer_decorrido_segundos?: number
          timer_iniciado_em?: string | null
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "atividades_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atividades_pasta_id_fkey"
            columns: ["pasta_id"]
            isOneToOne: false
            referencedRelation: "pastas_atividade"
            referencedColumns: ["id"]
          },
        ]
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
          planilha_referencias_url: string | null
          user_id: string | null
          created_at: string | null
          id: string
          arquivado: boolean
          idade: number
          link_painel_receita: string | null
          meta_atual: string | null
          nicho: string
          nome_especialista: string
          updated_at: string | null
        }
        Insert: {
          planilha_referencias_url?: string | null
          user_id?: string | null
          arquivado?: boolean
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
          planilha_referencias_url?: string | null
          arquivado?: boolean
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
      colunas_atividade: {
        Row: {
          cliente_id: string | null
          created_at: string
          eh_conclusao: boolean
          id: string
          nome: string
          ordem: number
          status_key: string
          user_id: string | null
        }
        Insert: {
          cliente_id?: string | null
          created_at?: string
          eh_conclusao?: boolean
          id?: string
          nome: string
          ordem?: number
          status_key: string
          user_id?: string | null
        }
        Update: {
          cliente_id?: string | null
          created_at?: string
          eh_conclusao?: boolean
          id?: string
          nome?: string
          ordem?: number
          status_key?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "colunas_atividade_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
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
      documento_pastas: {
        Row: {
          created_at: string
          documento_id: string
          pasta_id: string
        }
        Insert: {
          created_at?: string
          documento_id: string
          pasta_id: string
        }
        Update: {
          created_at?: string
          documento_id?: string
          pasta_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "documento_pastas_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documento_pastas_pasta_id_fkey"
            columns: ["pasta_id"]
            isOneToOne: false
            referencedRelation: "pastas_atividade"
            referencedColumns: ["id"]
          },
        ]
      }
      documentos: {
        Row: {
          atividade_id: string | null
          cliente_id: string | null
          conteudo: string | null
          created_at: string
          deleted_at: string | null
          fixado: boolean
          id: string
          pasta_id: string | null
          titulo: string
          updated_at: string
        }
        Insert: {
          atividade_id?: string | null
          cliente_id?: string | null
          conteudo?: string | null
          created_at?: string
          deleted_at?: string | null
          fixado?: boolean
          id?: string
          pasta_id?: string | null
          titulo?: string
          updated_at?: string
        }
        Update: {
          atividade_id?: string | null
          cliente_id?: string | null
          conteudo?: string | null
          created_at?: string
          deleted_at?: string | null
          fixado?: boolean
          id?: string
          pasta_id?: string | null
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "documentos_pasta_id_fkey"
            columns: ["pasta_id"]
            isOneToOne: false
            referencedRelation: "pastas_atividade"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_atividade_id_fkey"
            columns: ["atividade_id"]
            isOneToOne: false
            referencedRelation: "atividades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      equipe_cliente: {
        Row: {
          cliente_id: string
          created_at: string | null
          id: string
          email: string | null
          clientes_permitidos: string[]
          permissoes: Json
          nome_pessoa: string
          papel: string
        }
        Insert: {
          cliente_id: string
          created_at?: string | null
          id?: string
          email?: string | null
          clientes_permitidos?: string[]
          permissoes?: Json
          nome_pessoa: string
          papel: string
        }
        Update: {
          cliente_id?: string
          created_at?: string | null
          id?: string
          email?: string | null
          clientes_permitidos?: string[]
          permissoes?: Json
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
      funil_categorias: {
        Row: {
          created_at: string | null
          id: string
          nome: string
          ordem: number | null
          produto_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          nome?: string
          ordem?: number | null
          produto_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          nome?: string
          ordem?: number | null
          produto_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "funil_categorias_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos_cliente"
            referencedColumns: ["id"]
          },
        ]
      }
      funil_vendas: {
        Row: {
          categoria_id: string | null
          cor: string | null
          created_at: string | null
          id: string
          imagem_url: string | null
          ordem: number | null
          parent_id: string | null
          posicao_x: number | null
          posicao_y: number | null
          produto_id: string
          titulo: string
        }
        Insert: {
          categoria_id?: string | null
          cor?: string | null
          created_at?: string | null
          id?: string
          imagem_url?: string | null
          ordem?: number | null
          parent_id?: string | null
          posicao_x?: number | null
          posicao_y?: number | null
          produto_id: string
          titulo: string
        }
        Update: {
          categoria_id?: string | null
          cor?: string | null
          created_at?: string | null
          id?: string
          imagem_url?: string | null
          ordem?: number | null
          parent_id?: string | null
          posicao_x?: number | null
          posicao_y?: number | null
          produto_id?: string
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "funil_vendas_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "funil_categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funil_vendas_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "funil_vendas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funil_vendas_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos_cliente"
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
      jarvis_configuracoes: {
        Row: {
          analisar_titulo_janela: boolean
          detectar_distracoes: boolean
          monitorar_app_ativo: boolean
          som_ativado: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          analisar_titulo_janela?: boolean
          detectar_distracoes?: boolean
          monitorar_app_ativo?: boolean
          som_ativado?: boolean
          updated_at?: string
          user_id?: string
        }
        Update: {
          analisar_titulo_janela?: boolean
          detectar_distracoes?: boolean
          monitorar_app_ativo?: boolean
          som_ativado?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      focus_activity_events: {
        Row: {
          app_name: string
          atividade_id: string | null
          bundle_id: string | null
          classification: string
          created_at: string
          duration_seconds: number | null
          ended_at: string | null
          id: string
          started_at: string
          user_id: string
          window_title: string | null
        }
        Insert: {
          app_name: string
          atividade_id?: string | null
          bundle_id?: string | null
          classification?: string
          created_at?: string
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          started_at: string
          user_id?: string
          window_title?: string | null
        }
        Update: {
          app_name?: string
          atividade_id?: string | null
          bundle_id?: string | null
          classification?: string
          created_at?: string
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          started_at?: string
          user_id?: string
          window_title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "focus_activity_events_atividade_id_fkey"
            columns: ["atividade_id"]
            isOneToOne: false
            referencedRelation: "atividades"
            referencedColumns: ["id"]
          },
        ]
      }
      focus_learned_rules: {
        Row: {
          app_name: string | null
          atividade_id: string | null
          bundle_id: string | null
          classification: string
          cliente_id: string | null
          created_at: string
          id: string
          updated_at: string
          user_id: string
          window_title_pattern: string | null
        }
        Insert: {
          app_name?: string | null
          atividade_id?: string | null
          bundle_id?: string | null
          classification: string
          cliente_id?: string | null
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
          window_title_pattern?: string | null
        }
        Update: {
          app_name?: string | null
          atividade_id?: string | null
          bundle_id?: string | null
          classification?: string
          cliente_id?: string | null
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
          window_title_pattern?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "focus_learned_rules_atividade_id_fkey"
            columns: ["atividade_id"]
            isOneToOne: false
            referencedRelation: "atividades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "focus_learned_rules_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      focus_sessions: {
        Row: {
          atividade_id: string | null
          cliente_id: string | null
          created_at: string
          duration_seconds: number
          ended_at: string
          ended_reason: string
          id: string
          started_at: string
          user_id: string
        }
        Insert: {
          atividade_id?: string | null
          cliente_id?: string | null
          created_at?: string
          duration_seconds: number
          ended_at: string
          ended_reason?: string
          id?: string
          started_at: string
          user_id?: string
        }
        Update: {
          atividade_id?: string | null
          cliente_id?: string | null
          created_at?: string
          duration_seconds?: number
          ended_at?: string
          ended_reason?: string
          id?: string
          started_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "focus_sessions_atividade_id_fkey"
            columns: ["atividade_id"]
            isOneToOne: false
            referencedRelation: "atividades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "focus_sessions_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_plan_activities: {
        Row: {
          activity_id: string
          created_at: string
          daily_plan_id: string
          id: string
          position: number
          user_id: string
        }
        Insert: {
          activity_id: string
          created_at?: string
          daily_plan_id: string
          id?: string
          position: number
          user_id?: string
        }
        Update: {
          activity_id?: string
          created_at?: string
          daily_plan_id?: string
          id?: string
          position?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_plan_activities_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "atividades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_plan_activities_daily_plan_id_fkey"
            columns: ["daily_plan_id"]
            isOneToOne: false
            referencedRelation: "daily_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_plans: {
        Row: {
          created_at: string
          date: string
          expected_blocker: string | null
          expected_blocker_other: string | null
          focus_time_available_minutes: number | null
          id: string
          main_priority_activity_id: string | null
          mandatory_outcome: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date: string
          expected_blocker?: string | null
          expected_blocker_other?: string | null
          focus_time_available_minutes?: number | null
          id?: string
          main_priority_activity_id?: string | null
          mandatory_outcome?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          date?: string
          expected_blocker?: string | null
          expected_blocker_other?: string | null
          focus_time_available_minutes?: number | null
          id?: string
          main_priority_activity_id?: string | null
          mandatory_outcome?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_plans_main_priority_activity_id_fkey"
            columns: ["main_priority_activity_id"]
            isOneToOne: false
            referencedRelation: "atividades"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_productivity_reports: {
        Row: {
          completed_main_priority: boolean
          completed_tasks: number
          created_at: string
          daily_plan_id: string | null
          date: string
          distraction_seconds: number
          eighty_twenty_completed_count: number | null
          eighty_twenty_total_count: number | null
          energy_score: number
          focus_score: number
          focus_sessions_count: number
          focused_seconds: number
          id: string
          longest_focus_seconds: number
          main_blocker: string | null
          main_blocker_other: string | null
          main_win: string | null
          overdue_tasks: number
          overtime_seconds: number
          pause_count: number
          paused_seconds: number
          pending_for_tomorrow: string | null
          planned_bed_time: string | null
          possible_distraction_seconds: number
          productivity_score: number
          started_tasks: number
          tomorrow_main_priority: string | null
          top_apps: Json
          top_projects: Json
          unfinished_tasks: number
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_main_priority: boolean
          completed_tasks?: number
          created_at?: string
          daily_plan_id?: string | null
          date: string
          distraction_seconds?: number
          eighty_twenty_completed_count?: number | null
          eighty_twenty_total_count?: number | null
          energy_score: number
          focus_score: number
          focus_sessions_count?: number
          focused_seconds?: number
          id?: string
          longest_focus_seconds?: number
          main_blocker?: string | null
          main_blocker_other?: string | null
          main_win?: string | null
          overdue_tasks?: number
          overtime_seconds?: number
          pause_count?: number
          paused_seconds?: number
          pending_for_tomorrow?: string | null
          planned_bed_time?: string | null
          possible_distraction_seconds?: number
          productivity_score: number
          started_tasks?: number
          tomorrow_main_priority?: string | null
          top_apps?: Json
          top_projects?: Json
          unfinished_tasks?: number
          updated_at?: string
          user_id?: string
        }
        Update: {
          completed_main_priority?: boolean
          completed_tasks?: number
          created_at?: string
          daily_plan_id?: string | null
          date?: string
          distraction_seconds?: number
          eighty_twenty_completed_count?: number | null
          eighty_twenty_total_count?: number | null
          energy_score?: number
          focus_score?: number
          focus_sessions_count?: number
          focused_seconds?: number
          id?: string
          longest_focus_seconds?: number
          main_blocker?: string | null
          main_blocker_other?: string | null
          main_win?: string | null
          overdue_tasks?: number
          overtime_seconds?: number
          pause_count?: number
          paused_seconds?: number
          pending_for_tomorrow?: string | null
          planned_bed_time?: string | null
          possible_distraction_seconds?: number
          productivity_score?: number
          started_tasks?: number
          tomorrow_main_priority?: string | null
          top_apps?: Json
          top_projects?: Json
          unfinished_tasks?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_productivity_reports_daily_plan_id_fkey"
            columns: ["daily_plan_id"]
            isOneToOne: false
            referencedRelation: "daily_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      jarvis_mensagens: {
        Row: {
          ativo: boolean
          contexto: string | null
          created_at: string
          id: string
          intervalo_minimo_minutos: number
          mensagem: string
          tipo: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ativo?: boolean
          contexto?: string | null
          created_at?: string
          id?: string
          intervalo_minimo_minutos?: number
          mensagem: string
          tipo: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          ativo?: boolean
          contexto?: string | null
          created_at?: string
          id?: string
          intervalo_minimo_minutos?: number
          mensagem?: string
          tipo?: string
          updated_at?: string
          user_id?: string
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
      pastas_atividade: {
        Row: {
          cliente_id: string | null
          created_at: string
          deleted_at: string | null
          id: string
          nome: string
          ordem: number
          origem: string
          user_id: string | null
        }
        Insert: {
          cliente_id?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          nome: string
          ordem?: number
          origem?: string
          user_id?: string | null
        }
        Update: {
          cliente_id?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          nome?: string
          ordem?: number
          origem?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pastas_atividade_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_goals: {
        Row: {
          automatic_source: string | null
          created_at: string
          end_date: string
          id: string
          linked_habit_id: string | null
          nome: string
          period: string
          pillar_id: string | null
          start_date: string
          target_value: number
          tipo: string
          unit: string | null
          updated_at: string
          user_id: string
          ativo: boolean
        }
        Insert: {
          automatic_source?: string | null
          created_at?: string
          end_date: string
          id?: string
          linked_habit_id?: string | null
          nome: string
          period: string
          pillar_id?: string | null
          start_date: string
          target_value: number
          tipo: string
          unit?: string | null
          updated_at?: string
          user_id?: string
          ativo?: boolean
        }
        Update: {
          automatic_source?: string | null
          created_at?: string
          end_date?: string
          id?: string
          linked_habit_id?: string | null
          nome?: string
          period?: string
          pillar_id?: string | null
          start_date?: string
          target_value?: number
          tipo?: string
          unit?: string | null
          updated_at?: string
          user_id?: string
          ativo?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "performance_goals_linked_habit_id_fkey"
            columns: ["linked_habit_id"]
            isOneToOne: false
            referencedRelation: "performance_habits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_goals_pillar_id_fkey"
            columns: ["pillar_id"]
            isOneToOne: false
            referencedRelation: "performance_pillars"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_habit_logs: {
        Row: {
          completed: boolean | null
          created_at: string
          date: string
          habit_id: string
          id: string
          notes: string | null
          updated_at: string
          user_id: string
          value_numeric: number | null
        }
        Insert: {
          completed?: boolean | null
          created_at?: string
          date: string
          habit_id: string
          id?: string
          notes?: string | null
          updated_at?: string
          user_id?: string
          value_numeric?: number | null
        }
        Update: {
          completed?: boolean | null
          created_at?: string
          date?: string
          habit_id?: string
          id?: string
          notes?: string | null
          updated_at?: string
          user_id?: string
          value_numeric?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "performance_habit_logs_habit_id_fkey"
            columns: ["habit_id"]
            isOneToOne: false
            referencedRelation: "performance_habits"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_habits: {
        Row: {
          ativo: boolean
          automatic_key: string | null
          created_at: string
          descricao: string | null
          dias_da_semana: number[] | null
          frequencia: string
          id: string
          lembrete_ativo: boolean
          lembrete_horario: string | null
          meta_diaria: number | null
          nome: string
          ordem: number
          pillar_id: string | null
          source: string
          tipo: string
          unidade: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          ativo?: boolean
          automatic_key?: string | null
          created_at?: string
          descricao?: string | null
          dias_da_semana?: number[] | null
          frequencia?: string
          id?: string
          lembrete_ativo?: boolean
          lembrete_horario?: string | null
          meta_diaria?: number | null
          nome: string
          ordem?: number
          pillar_id?: string | null
          source?: string
          tipo: string
          unidade?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          ativo?: boolean
          automatic_key?: string | null
          created_at?: string
          descricao?: string | null
          dias_da_semana?: number[] | null
          frequencia?: string
          id?: string
          lembrete_ativo?: boolean
          lembrete_horario?: string | null
          meta_diaria?: number | null
          nome?: string
          ordem?: number
          pillar_id?: string | null
          source?: string
          tipo?: string
          unidade?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "performance_habits_pillar_id_fkey"
            columns: ["pillar_id"]
            isOneToOne: false
            referencedRelation: "performance_pillars"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_pillars: {
        Row: {
          created_at: string
          id: string
          nome: string
          ordem: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          nome: string
          ordem?: number
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string
          ordem?: number
          updated_at?: string
          user_id?: string
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
      produto_financeiro: {
        Row: {
          created_at: string | null
          custos: number | null
          id: string
          mes: string
          notas: string | null
          produto_id: string
          receita_bruta: number | null
          reembolsos: number | null
          vendas_quantidade: number | null
        }
        Insert: {
          created_at?: string | null
          custos?: number | null
          id?: string
          mes: string
          notas?: string | null
          produto_id: string
          receita_bruta?: number | null
          reembolsos?: number | null
          vendas_quantidade?: number | null
        }
        Update: {
          created_at?: string | null
          custos?: number | null
          id?: string
          mes?: string
          notas?: string | null
          produto_id?: string
          receita_bruta?: number | null
          reembolsos?: number | null
          vendas_quantidade?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "produto_financeiro_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos_cliente"
            referencedColumns: ["id"]
          },
        ]
      }
      produto_financeiro_diario: {
        Row: {
          created_at: string | null
          custos: number | null
          data: string
          id: string
          notas: string | null
          produto_id: string
          receita: number | null
          reembolsos: number | null
          vendas_quantidade: number | null
        }
        Insert: {
          created_at?: string | null
          custos?: number | null
          data: string
          id?: string
          notas?: string | null
          produto_id: string
          receita?: number | null
          reembolsos?: number | null
          vendas_quantidade?: number | null
        }
        Update: {
          created_at?: string | null
          custos?: number | null
          data?: string
          id?: string
          notas?: string | null
          produto_id?: string
          receita?: number | null
          reembolsos?: number | null
          vendas_quantidade?: number | null
        }
        Relationships: []
      }
      produtos_cliente: {
        Row: {
          acesso_instrucoes: string | null
          acesso_url: string | null
          cliente_id: string
          created_at: string
          descricao: string | null
          id: string
          ideias: string | null
          links_checkout: Json | null
          nome_produto: string
          preco: string | null
          status: string | null
        }
        Insert: {
          acesso_instrucoes?: string | null
          acesso_url?: string | null
          cliente_id: string
          created_at?: string
          descricao?: string | null
          id?: string
          ideias?: string | null
          links_checkout?: Json | null
          nome_produto: string
          preco?: string | null
          status?: string | null
        }
        Update: {
          acesso_instrucoes?: string | null
          acesso_url?: string | null
          cliente_id?: string
          created_at?: string
          descricao?: string | null
          id?: string
          ideias?: string | null
          links_checkout?: Json | null
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
      relatorio_registros: {
        Row: {
          cliente_id: string | null
          created_at: string
          data: string
          id: string
          registrado_em: string
          texto: string
          user_id: string
        }
        Insert: {
          cliente_id?: string | null
          created_at?: string
          data?: string
          id?: string
          registrado_em?: string
          texto: string
          user_id?: string
        }
        Update: {
          cliente_id?: string | null
          created_at?: string
          data?: string
          id?: string
          registrado_em?: string
          texto?: string
          user_id?: string
        }
        Relationships: []
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
      sleep_goals: {
        Row: {
          ideal_bed_time: string | null
          ideal_wake_time: string | null
          target_sleep_minutes: number
          updated_at: string
          user_id: string
        }
        Insert: {
          ideal_bed_time?: string | null
          ideal_wake_time?: string | null
          target_sleep_minutes?: number
          updated_at?: string
          user_id?: string
        }
        Update: {
          ideal_bed_time?: string | null
          ideal_wake_time?: string | null
          target_sleep_minutes?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sleep_logs: {
        Row: {
          bed_time: string
          created_at: string
          id: string
          night_awakenings: number | null
          notes: string | null
          quality_score: number
          sleep_date: string
          source: string
          total_sleep_minutes: number
          updated_at: string
          user_id: string
          wake_feeling: string | null
          wake_time: string
        }
        Insert: {
          bed_time: string
          created_at?: string
          id?: string
          night_awakenings?: number | null
          notes?: string | null
          quality_score: number
          sleep_date: string
          source?: string
          total_sleep_minutes: number
          updated_at?: string
          user_id?: string
          wake_feeling?: string | null
          wake_time: string
        }
        Update: {
          bed_time?: string
          created_at?: string
          id?: string
          night_awakenings?: number | null
          notes?: string | null
          quality_score?: number
          sleep_date?: string
          source?: string
          total_sleep_minutes?: number
          updated_at?: string
          user_id?: string
          wake_feeling?: string | null
          wake_time?: string
        }
        Relationships: []
      }
      subtarefas_atividade: {
        Row: {
          atividade_id: string
          concluida: boolean
          created_at: string
          id: string
          ordem: number
          titulo: string
        }
        Insert: {
          atividade_id: string
          concluida?: boolean
          created_at?: string
          id?: string
          ordem?: number
          titulo: string
        }
        Update: {
          atividade_id?: string
          concluida?: boolean
          created_at?: string
          id?: string
          ordem?: number
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "subtarefas_atividade_atividade_id_fkey"
            columns: ["atividade_id"]
            isOneToOne: false
            referencedRelation: "atividades"
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
          criador: string | null
          data_publicacao: string | null
          visualizacoes: number | null
          transcricao: string | null
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
          criador?: string | null
          data_publicacao?: string | null
          visualizacoes?: number | null
          transcricao?: string | null
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
          criador?: string | null
          data_publicacao?: string | null
          visualizacoes?: number | null
          transcricao?: string | null
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
          ideia_origem_id: string | null
          arquivo_chave: string | null
          arquivo_nome: string | null
          arquivo_tamanho: number | null
          arquivo_url: string | null
          editado_chave: string | null
          editado_nome: string | null
          editado_tamanho: number | null
          editado_url: string | null
          cliente_id: string
          created_at: string
          data_postagem: string | null
          descricao: string | null
          escalado: boolean
          id: string
          ordem: number
          origem_plataforma: string | null
          referencia_id: string | null
          roteiro: string | null
          status: string
          titulo: string
        }
        Insert: {
          ideia_origem_id?: string | null
          arquivo_chave?: string | null
          arquivo_nome?: string | null
          arquivo_tamanho?: number | null
          arquivo_url?: string | null
          editado_chave?: string | null
          editado_nome?: string | null
          editado_tamanho?: number | null
          editado_url?: string | null
          cliente_id: string
          created_at?: string
          data_postagem?: string | null
          descricao?: string | null
          escalado?: boolean
          id?: string
          ordem?: number
          origem_plataforma?: string | null
          referencia_id?: string | null
          roteiro?: string | null
          status?: string
          titulo: string
        }
        Update: {
          ideia_origem_id?: string | null
          arquivo_chave?: string | null
          arquivo_nome?: string | null
          arquivo_tamanho?: number | null
          arquivo_url?: string | null
          editado_chave?: string | null
          editado_nome?: string | null
          editado_tamanho?: number | null
          editado_url?: string | null
          cliente_id?: string
          created_at?: string
          data_postagem?: string | null
          descricao?: string | null
          escalado?: boolean
          id?: string
          ordem?: number
          origem_plataforma?: string | null
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
          arquivo_chave: string | null
          arquivo_nome: string | null
          arquivo_tamanho: number | null
          arquivo_url: string | null
          editado_chave: string | null
          editado_nome: string | null
          editado_tamanho: number | null
          editado_url: string | null
          cliente_id: string
          created_at: string
          data_postagem: string | null
          descricao: string | null
          id: string
          ordem: number
          origem_plataforma: string | null
          roteiro: string | null
          status: string
          titulo: string
        }
        Insert: {
          arquivo_chave?: string | null
          arquivo_nome?: string | null
          arquivo_tamanho?: number | null
          arquivo_url?: string | null
          editado_chave?: string | null
          editado_nome?: string | null
          editado_tamanho?: number | null
          editado_url?: string | null
          cliente_id: string
          created_at?: string
          data_postagem?: string | null
          descricao?: string | null
          id?: string
          ordem?: number
          origem_plataforma?: string | null
          roteiro?: string | null
          status?: string
          titulo: string
        }
        Update: {
          arquivo_chave?: string | null
          arquivo_nome?: string | null
          arquivo_tamanho?: number | null
          arquivo_url?: string | null
          editado_chave?: string | null
          editado_nome?: string | null
          editado_tamanho?: number | null
          editado_url?: string | null
          cliente_id?: string
          created_at?: string
          data_postagem?: string | null
          descricao?: string | null
          id?: string
          ordem?: number
          origem_plataforma?: string | null
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
      team_access: { Args: { target: string }; Returns: Json }
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
