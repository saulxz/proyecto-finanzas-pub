import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export interface CategoriaRow {
  id: string;
  value: string;
  label: string;
  icon: string;
  creado_en: string;
}

// GET /api/categorias — listar todas las categorías
export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("categorias")
    .select("*")
    .order("label", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data as CategoriaRow[]);
}

// POST /api/categorias — crear nueva categoría
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { value, label } = body;

    if (!value || !label) {
      return NextResponse.json(
        { error: "value y label son obligatorios" },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("categorias")
      .insert({ value, label })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: `Ya existe una categoría con el identificador "${value}"` },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data as CategoriaRow, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error interno" },
      { status: 500 }
    );
  }
}

// DELETE /api/categorias — eliminar categoría
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const value = searchParams.get("value");

    if (!id && !value) {
      return NextResponse.json(
        { error: "Se requiere id o value" },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const query = supabase.from("categorias").delete();
    if (id) {
      query.eq("id", id);
    } else if (value) {
      query.eq("value", value);
    } else {
      return NextResponse.json(
        { error: "Se requiere id o value" },
        { status: 400 }
      );
    }

    const { error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error interno" },
      { status: 500 }
    );
  }
}
