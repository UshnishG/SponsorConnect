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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      email_messages: {
        Row: {
          body: string
          bounce_checked_at: string | null
          created_at: string
          failure_reason: string | null
          gmail_message_id: string | null
          id: string
          processed: boolean
          recipient_email: string
          recipient_name: string | null
          sender_email: string
          smtp_response: string | null
          status: Database["public"]["Enums"]["email_status"]
          subject: string
          template_type: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          body?: string
          bounce_checked_at?: string | null
          created_at?: string
          failure_reason?: string | null
          gmail_message_id?: string | null
          id?: string
          processed?: boolean
          recipient_email: string
          recipient_name?: string | null
          sender_email: string
          smtp_response?: string | null
          status?: Database["public"]["Enums"]["email_status"]
          subject: string
          template_type?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          bounce_checked_at?: string | null
          created_at?: string
          failure_reason?: string | null
          gmail_message_id?: string | null
          id?: string
          processed?: boolean
          recipient_email?: string
          recipient_name?: string | null
          sender_email?: string
          smtp_response?: string | null
          status?: Database["public"]["Enums"]["email_status"]
          subject?: string
          template_type?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      email_templates: {
        Row: {
          body_md: string
          created_at: string
          created_by: string | null
          description: string | null
          event_dates: string | null
          footer_image_url: string | null
          header_bg: string | null
          header_image_url: string | null
          header_tagline: string | null
          id: string
          key: string
          label: string
          logo_urls: string[]
          secondary_cta_label: string | null
          secondary_cta_url: string | null
          sign_off: string | null
          subject: string
          updated_at: string
        }
        Insert: {
          body_md?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          event_dates?: string | null
          footer_image_url?: string | null
          header_bg?: string | null
          header_image_url?: string | null
          header_tagline?: string | null
          id?: string
          key: string
          label: string
          logo_urls?: string[]
          secondary_cta_label?: string | null
          secondary_cta_url?: string | null
          sign_off?: string | null
          subject?: string
          updated_at?: string
        }
        Update: {
          body_md?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          event_dates?: string | null
          footer_image_url?: string | null
          header_bg?: string | null
          header_image_url?: string | null
          header_tagline?: string | null
          id?: string
          key?: string
          label?: string
          logo_urls?: string[]
          secondary_cta_label?: string | null
          secondary_cta_url?: string | null
          sign_off?: string | null
          subject?: string
          updated_at?: string
        }
        Relationships: []
      }
      gmail_tokens: {
        Row: {
          connected_at: string
          gmail_email: string
          refresh_token: string
          scope: string
          updated_at: string
          user_id: string
        }
        Insert: {
          connected_at?: string
          gmail_email: string
          refresh_token: string
          scope: string
          updated_at?: string
          user_id: string
        }
        Update: {
          connected_at?: string
          gmail_email?: string
          refresh_token?: string
          scope?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          id: string
          is_active: boolean
          last_login: string | null
          name: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          id: string
          is_active?: boolean
          last_login?: string | null
          name?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          id?: string
          is_active?: boolean
          last_login?: string | null
          name?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      today_send_count: { Args: { _user_id: string }; Returns: number }
    }
    Enums: {
      app_role: "admin" | "volunteer"
      email_status:
        | "QUEUED"
        | "SENDING"
        | "SENT"
        | "DELIVERED_TO_SERVER"
        | "FAILED"
        | "INVALID_EMAIL"
        | "MAILBOX_NOT_FOUND"
        | "DOMAIN_NOT_FOUND"
        | "MAILBOX_FULL"
        | "BLOCKED"
        | "TEMPORARY_FAILURE"
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
      app_role: ["admin", "volunteer"],
      email_status: [
        "QUEUED",
        "SENDING",
        "SENT",
        "DELIVERED_TO_SERVER",
        "FAILED",
        "INVALID_EMAIL",
        "MAILBOX_NOT_FOUND",
        "DOMAIN_NOT_FOUND",
        "MAILBOX_FULL",
        "BLOCKED",
        "TEMPORARY_FAILURE",
      ],
    },
  },
} as const
