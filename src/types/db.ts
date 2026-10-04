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
