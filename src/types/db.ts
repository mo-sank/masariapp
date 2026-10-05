export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      app_config: {
        Row: {
          key: string;
          value: NonNullable<Json>;
        };
        Insert: {
          key: string;
          value: NonNullable<Json>;
        };
        Update: {
          key?: string;
          value?: NonNullable<Json>;
        };
        Relationships: [];
      };
      consents: {
        Row: {
          accepted_at: string;
          consent_type: string;
          id: string;
          user_id: string;
          version: string;
        };
        Insert: {
          accepted_at?: string;
          consent_type: string;
          id?: string;
          user_id: string;
          version: string;
        };
        Update: {
          accepted_at?: string;
          consent_type?: string;
          id?: string;
          user_id?: string;
          version?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'consents_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['user_id'];
          },
        ];
      };
      events: {
        Row: {
          app_version: string | null;
          client_ts: string | null;
          created_at: string;
          id: number;
          name: string;
          props: NonNullable<Json>;
          session_id: string | null;
          user_id: string;
        };
        Insert: {
          app_version?: string | null;
          client_ts?: string | null;
          created_at?: string;
          id?: never;
          name: string;
          props?: NonNullable<Json>;
          session_id?: string | null;
          user_id: string;
        };
        Update: {
          app_version?: string | null;
          client_ts?: string | null;
          created_at?: string;
          id?: never;
          name?: string;
          props?: NonNullable<Json>;
          session_id?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'events_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['user_id'];
          },
        ];
      };
      lesson_progress: {
        Row: {
          attempts: number;
          best_score: number | null;
          completed_at: string | null;
          first_try_score: number | null;
          lesson_id: string;
          status: string;
          updated_at: string;
          user_id: string;
          xp_awarded: number;
        };
        Insert: {
          attempts?: number;
          best_score?: number | null;
          completed_at?: string | null;
          first_try_score?: number | null;
          lesson_id: string;
          status: string;
          updated_at?: string;
          user_id: string;
          xp_awarded?: number;
        };
        Update: {
          attempts?: number;
          best_score?: number | null;
          completed_at?: string | null;
          first_try_score?: number | null;
          lesson_id?: string;
          status?: string;
          updated_at?: string;
          user_id?: string;
          xp_awarded?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'lesson_progress_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['user_id'];
          },
        ];
      };
      user_unlocks: {
        Row: {
          feature_key: string;
          source_lesson_id: string | null;
          unlocked_at: string;
          user_id: string;
        };
        Insert: {
          feature_key: string;
          source_lesson_id?: string | null;
          unlocked_at?: string;
          user_id: string;
        };
        Update: {
          feature_key?: string;
          source_lesson_id?: string | null;
          unlocked_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_unlocks_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['user_id'];
          },
        ];
      };
      rewind_items: {
        Row: {
          box: number;
          due_at: string;
          id: string;
          item_id: string;
          last_seen_at: string | null;
          lesson_id: string;
          user_id: string;
        };
        Insert: {
          box?: number;
          due_at?: string;
          id?: string;
          item_id: string;
          last_seen_at?: string | null;
          lesson_id: string;
          user_id: string;
        };
        Update: {
          box?: number;
          due_at?: string;
          id?: string;
          item_id?: string;
          last_seen_at?: string | null;
          lesson_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'rewind_items_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['user_id'];
          },
        ];
      };
      instruments: {
        Row: {
          is_active: boolean;
          is_starter: boolean;
          name: string;
          sector: string | null;
          sort_order: number | null;
          symbol: string;
          type: string;
        };
        Insert: {
          is_active?: boolean;
          is_starter?: boolean;
          name: string;
          sector?: string | null;
          sort_order?: number | null;
          symbol: string;
          type?: string;
        };
        Update: {
          is_active?: boolean;
          is_starter?: boolean;
          name?: string;
          sector?: string | null;
          sort_order?: number | null;
          symbol?: string;
          type?: string;
        };
        Relationships: [];
      };
      quotes: {
        Row: {
          as_of: string;
          high_cents: number | null;
          is_delayed: boolean;
          low_cents: number | null;
          open_cents: number | null;
          prev_close_cents: number | null;
          price_cents: number;
          source: string;
          symbol: string;
          updated_at: string;
          volume: number | null;
        };
        Insert: {
          as_of: string;
          high_cents?: number | null;
          is_delayed?: boolean;
          low_cents?: number | null;
          open_cents?: number | null;
          prev_close_cents?: number | null;
          price_cents: number;
          source: string;
          symbol: string;
          updated_at?: string;
          volume?: number | null;
        };
        Update: {
          as_of?: string;
          high_cents?: number | null;
          is_delayed?: boolean;
          low_cents?: number | null;
          open_cents?: number | null;
          prev_close_cents?: number | null;
          price_cents?: number;
          source?: string;
          symbol?: string;
          updated_at?: string;
          volume?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'quotes_symbol_fkey';
            columns: ['symbol'];
            isOneToOne: true;
            referencedRelation: 'instruments';
            referencedColumns: ['symbol'];
          },
        ];
      };
      quote_bars: {
        Row: {
          bar_date: string;
          close_cents: number;
          high_cents: number;
          low_cents: number;
          open_cents: number;
          symbol: string;
          volume: number | null;
        };
        Insert: {
          bar_date: string;
          close_cents: number;
          high_cents: number;
          low_cents: number;
          open_cents: number;
          symbol: string;
          volume?: number | null;
        };
        Update: {
          bar_date?: string;
          close_cents?: number;
          high_cents?: number;
          low_cents?: number;
          open_cents?: number;
          symbol?: string;
          volume?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'quote_bars_symbol_fkey';
            columns: ['symbol'];
            isOneToOne: false;
            referencedRelation: 'instruments';
            referencedColumns: ['symbol'];
          },
        ];
      };
      market_holidays: {
        Row: {
          holiday_date: string;
          is_early_close: boolean;
          name: string;
        };
        Insert: {
          holiday_date: string;
          is_early_close?: boolean;
          name: string;
        };
        Update: {
          holiday_date?: string;
          is_early_close?: boolean;
          name?: string;
        };
        Relationships: [];
      };
      positions: {
        Row: {
          account_id: string;
          cost_basis_cents: number;
          qty: number;
          symbol: string;
          updated_at: string;
        };
        Insert: {
          account_id: string;
          cost_basis_cents: number;
          qty: number;
          symbol: string;
          updated_at?: string;
        };
        Update: {
          account_id?: string;
          cost_basis_cents?: number;
          qty?: number;
          symbol?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'positions_account_id_fkey';
            columns: ['account_id'];
            isOneToOne: false;
            referencedRelation: 'paper_accounts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'positions_symbol_fkey';
            columns: ['symbol'];
            isOneToOne: false;
            referencedRelation: 'instruments';
            referencedColumns: ['symbol'];
          },
        ];
      };
      orders: {
        Row: {
          account_id: string;
          created_at: string;
          fill_price_cents: number | null;
          id: string;
          idempotency_key: string;
          order_type: string;
          price_as_of: string | null;
          price_source: string | null;
          qty: number;
          rationale_tags: string[];
          rationale_text: string | null;
          realized_pl_cents: number | null;
          side: string;
          status: string;
          symbol: string;
          total_cents: number | null;
          user_id: string;
        };
        Insert: {
          account_id: string;
          created_at?: string;
          fill_price_cents?: number | null;
          id?: string;
          idempotency_key: string;
          order_type?: string;
          price_as_of?: string | null;
          price_source?: string | null;
          qty: number;
          rationale_tags?: string[];
          rationale_text?: string | null;
          realized_pl_cents?: number | null;
          side: string;
          status?: string;
          symbol: string;
          total_cents?: number | null;
          user_id: string;
        };
        Update: {
          account_id?: string;
          created_at?: string;
          fill_price_cents?: number | null;
          id?: string;
          idempotency_key?: string;
          order_type?: string;
          price_as_of?: string | null;
          price_source?: string | null;
          qty?: number;
          rationale_tags?: string[];
          rationale_text?: string | null;
          realized_pl_cents?: number | null;
          side?: string;
          status?: string;
          symbol?: string;
          total_cents?: number | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'orders_account_id_fkey';
            columns: ['account_id'];
            isOneToOne: false;
            referencedRelation: 'paper_accounts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'orders_symbol_fkey';
            columns: ['symbol'];
            isOneToOne: false;
            referencedRelation: 'instruments';
            referencedColumns: ['symbol'];
          },
          {
            foreignKeyName: 'orders_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['user_id'];
          },
        ];
      };
      trade_reflections: {
        Row: {
          created_at: string;
          expectation: string;
          id: string;
          note: string | null;
          order_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          expectation: string;
          id?: string;
          note?: string | null;
          order_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          expectation?: string;
          id?: string;
          note?: string | null;
          order_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'trade_reflections_order_id_fkey';
            columns: ['order_id'];
            isOneToOne: true;
            referencedRelation: 'orders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'trade_reflections_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['user_id'];
          },
        ];
      };
      watchlist_items: {
        Row: {
          added_at: string;
          symbol: string;
          user_id: string;
        };
        Insert: {
          added_at?: string;
          symbol: string;
          user_id: string;
        };
        Update: {
          added_at?: string;
          symbol?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'watchlist_items_symbol_fkey';
            columns: ['symbol'];
            isOneToOne: false;
            referencedRelation: 'instruments';
            referencedColumns: ['symbol'];
          },
          {
            foreignKeyName: 'watchlist_items_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['user_id'];
          },
        ];
      };
      portfolio_snapshots: {
        Row: {
          account_id: string;
          cash_cents: number;
          equity_cents: number;
          positions_value_cents: number;
          snap_date: string;
        };
        Insert: {
          account_id: string;
          cash_cents: number;
          equity_cents: number;
          positions_value_cents: number;
          snap_date: string;
        };
        Update: {
          account_id?: string;
          cash_cents?: number;
          equity_cents?: number;
          positions_value_cents?: number;
          snap_date?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'portfolio_snapshots_account_id_fkey';
            columns: ['account_id'];
            isOneToOne: false;
            referencedRelation: 'paper_accounts';
            referencedColumns: ['id'];
          },
        ];
      };
      paper_accounts: {
        Row: {
          cash_cents: number;
          created_at: string;
          id: string;
          starting_cash_cents: number;
          user_id: string;
        };
        Insert: {
          cash_cents: number;
          created_at?: string;
          id?: string;
          starting_cash_cents: number;
          user_id: string;
        };
        Update: {
          cash_cents?: number;
          created_at?: string;
          id?: string;
          starting_cash_cents?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'paper_accounts_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: true;
            referencedRelation: 'profiles';
            referencedColumns: ['user_id'];
          },
        ];
      };
      profiles: {
        Row: {
          age_band: string;
          avatar_key: string;
          birth_year: number;
          created_at: string;
          timezone: string;
          user_id: string;
          username: string;
        };
        Insert: {
          age_band: string;
          avatar_key?: string;
          birth_year: number;
          created_at?: string;
          timezone?: string;
          user_id: string;
          username: string;
        };
        Update: {
          age_band?: string;
          avatar_key?: string;
          birth_year?: number;
          created_at?: string;
          timezone?: string;
          user_id?: string;
          username?: string;
        };
        Relationships: [];
      };
      user_stats: {
        Row: {
          last_active_date: string | null;
          streak_current: number;
          streak_freezes: number;
          streak_longest: number;
          user_id: string;
          xp_total: number;
        };
        Insert: {
          last_active_date?: string | null;
          streak_current?: number;
          streak_freezes?: number;
          streak_longest?: number;
          user_id: string;
          xp_total?: number;
        };
        Update: {
          last_active_date?: string | null;
          streak_current?: number;
          streak_freezes?: number;
          streak_longest?: number;
          user_id?: string;
          xp_total?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'user_stats_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: true;
            referencedRelation: 'profiles';
            referencedColumns: ['user_id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      current_user_id: { Args: Record<PropertyKey, never>; Returns: string };
      create_profile: {
        Args: {
          p_username: string;
          p_birth_year: number;
          p_birth_month: number;
          p_timezone: string;
          p_terms_version: string;
          p_privacy_version: string;
        };
        Returns: Database['public']['Tables']['profiles']['Row'];
      };
      log_events: {
        Args: {
          p_events: Json;
        };
        Returns: number;
      };
      complete_lesson: {
        Args: {
          p_lesson_id: string;
          p_score: number;
          p_duration_ms: number;
          p_answers: Json;
        };
        Returns: Json;
      };
      submit_assessment: {
        Args: {
          p_lesson_id: string;
          p_form: string;
          p_item_results: Json;
        };
        Returns: {
          id: string;
          user_id: string;
          lesson_id: string;
          form: string;
          score_pct: number;
          item_results: Json;
          taken_at: string;
        };
      };
      save_rewind_items: {
        Args: {
          p_items: Json;
        };
        Returns: number;
      };
      review_rewind_item: {
        Args: {
          p_item_id: string;
          p_correct: boolean;
        };
        Returns: Database['public']['Tables']['rewind_items']['Row'];
      };
      market_is_open: {
        Args: {
          p_at?: string;
        };
        Returns: boolean;
      };
      market_session: {
        Args: {
          p_at?: string;
        };
        Returns: string;
      };
      place_market_order: {
        Args: {
          p_symbol: string;
          p_side: string;
          p_qty: number;
          p_idempotency_key: string;
          p_rationale_tags?: string[];
          p_rationale_text?: string | null;
        };
        Returns: Database['public']['Tables']['orders']['Row'];
      };
      submit_reflection: {
        Args: {
          p_order_id: string;
          p_expectation: string;
          p_note?: string | null;
        };
        Returns: Database['public']['Tables']['trade_reflections']['Row'];
      };
      watchlist_add: {
        Args: {
          p_symbol: string;
        };
        Returns: Database['public']['Tables']['watchlist_items']['Row'];
      };
      watchlist_remove: {
        Args: {
          p_symbol: string;
        };
        Returns: undefined;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
