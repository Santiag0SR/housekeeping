-- Ejecuta esto en el SQL Editor de tu proyecto Supabase

CREATE TABLE room_cleaning_status (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id TEXT NOT NULL,
  room_name TEXT NOT NULL,
  date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'cleaned'
  cleaned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(room_id, date)
);

-- Índice para búsquedas por fecha
CREATE INDEX idx_room_cleaning_date ON room_cleaning_status(date);

-- Actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON room_cleaning_status
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
