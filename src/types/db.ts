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
