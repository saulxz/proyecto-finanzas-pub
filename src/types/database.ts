export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      perfiles: {
        Row: {
          id: string;
          email: string;
          nombre: string;
          creado_en: string;
          actualizado_en: string;
        };
        Insert: {
          id: string;
          email: string;
          nombre?: string;
          creado_en?: string;
          actualizado_en?: string;
        };
        Update: {
          id?: string;
          email?: string;
          nombre?: string;
          creado_en?: string;
          actualizado_en?: string;
        };
        Relationships: [
          {
            foreignKeyName: "perfiles_id_fkey";
            columns: ["id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          }
        ];
      };
      transacciones: {
        Row: {
          id: string;
          creado_en: string;
          tipo: "ingreso" | "gasto";
          cantidad: number;
          categoria: string;
          concepto: string;
          usuario_id: string;
          recurrente: boolean;
          ultima_generacion: string | null;
          tags: string[];
        };
        Insert: {
          id?: string;
          creado_en?: string;
          tipo: "ingreso" | "gasto";
          cantidad: number;
          categoria: string;
          concepto?: string;
          usuario_id: string;
          recurrente?: boolean;
          ultima_generacion?: string | null;
          tags?: string[];
        };
        Update: {
          id?: string;
          creado_en?: string;
          tipo?: "ingreso" | "gasto";
          cantidad?: number;
          categoria?: string;
          concepto?: string;
          usuario_id?: string;
          recurrente?: boolean;
          ultima_generacion?: string | null;
          tags?: string[];
        };
        Relationships: [
          {
            foreignKeyName: "transacciones_usuario_id_fkey";
            columns: ["usuario_id"];
            referencedRelation: "perfiles";
            referencedColumns: ["id"];
          }
        ];
      };
      presupuestos: {
        Row: {
          id: string;
          creado_en: string;
          actualizado_en: string;
          user_id: string;
          categoria: string;
          limite_mensual: number;
        };
        Insert: {
          id?: string;
          creado_en?: string;
          actualizado_en?: string;
          user_id: string;
          categoria: string;
          limite_mensual: number;
        };
        Update: {
          id?: string;
          creado_en?: string;
          actualizado_en?: string;
          user_id?: string;
          categoria?: string;
          limite_mensual?: number;
        };
        Relationships: [
          {
            foreignKeyName: "presupuestos_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "perfiles";
            referencedColumns: ["id"];
          }
        ];
      };
      categorias: {
        Row: {
          id: string;
          value: string;
          label: string;
          icon: string;
          creado_en: string;
        };
        Insert: {
          id?: string;
          value: string;
          label: string;
          icon?: string;
          creado_en?: string;
        };
        Update: {
          id?: string;
          value?: string;
          label?: string;
          icon?: string;
          creado_en?: string;
        };
        Relationships: [];
      };
    };
    Views: {};
    Functions: {};
    Enums: {
      tipo_transaccion: "ingreso" | "gasto";
    };
  };
};
